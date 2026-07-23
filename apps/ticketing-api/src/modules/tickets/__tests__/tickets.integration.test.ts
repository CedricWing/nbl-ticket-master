import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../../shared/database/client.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/index.js';
import { users } from '../../auth/index.js';
import { games as gamesTable, seats as seatsTable, teams } from '../../games/index.js';
import { tickets as ticketsTable } from '../schema.js';
import { bookTicket, refundTicket } from '../service.js';

async function getSeededUser(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) throw new Error(`Expected seeded user "${email}" — run pnpm seed first`);
  return user;
}

async function getSeededTeam(name: string) {
  const [team] = await db.select().from(teams).where(eq(teams.name, name));
  if (!team) throw new Error(`Expected seeded team "${name}" — run pnpm seed first`);
  return team;
}

let admin: Awaited<ReturnType<typeof getSeededUser>>;
let member: Awaited<ReturnType<typeof getSeededUser>>;
let seasonHolder: Awaited<ReturnType<typeof getSeededUser>>;
let melbourneUnited: Awaited<ReturnType<typeof getSeededTeam>>;
let sydneyKings: Awaited<ReturnType<typeof getSeededTeam>>;

const futureDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

const createdGameIds: string[] = [];

beforeAll(async () => {
  admin = await getSeededUser('admin@example.com');
  member = await getSeededUser('member@example.com');
  seasonHolder = await getSeededUser('season@example.com');
  melbourneUnited = await getSeededTeam('Melbourne United');
  sydneyKings = await getSeededTeam('Sydney Kings');
});

afterEach(async () => {
  for (const gameId of createdGameIds) {
    await db.delete(ticketsTable).where(eq(ticketsTable.gameId, gameId));
    await db.delete(seatsTable).where(eq(seatsTable.gameId, gameId));
    await db.delete(gamesTable).where(eq(gamesTable.id, gameId));
  }
  createdGameIds.length = 0;
});

// util fn: creates a bare game + one seat
async function createGameWithSeat(
  status: 'available' | 'booked' | 'reserved_season' = 'available',
) {
  const [game] = await db
    .insert(gamesTable)
    .values({
      homeTeamId: sydneyKings.id,
      awayTeamId: melbourneUnited.id,
      startsAt: futureDate(),
      createdBy: admin.id,
    })
    .returning();
  createdGameIds.push(game!.id);

  const [seat] = await db
    .insert(seatsTable)
    .values({ gameId: game!.id, section: 'A', row: '1', seatNumber: 1, priceCents: 4500, status })
    .returning();

  return { game: game!, seat: seat! };
}

describe('bookTicket', () => {
  it('resolves exactly one winner when two users race for the same seat', async () => {
    const { seat } = await createGameWithSeat();

    // Promise.all(...) with two independent bookTicket calls (not sequential awaits) so both
    // requests are in flight together against the pool
    const results = await Promise.allSettled([
      bookTicket({ seatId: seat.id, userId: admin.id }),
      bookTicket({ seatId: seat.id, userId: member.id }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

    const finalTickets = await db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.seatId, seat.id));
    expect(finalTickets).toHaveLength(1);

    const [finalSeat] = await db.select().from(seatsTable).where(eq(seatsTable.id, seat.id));
    expect(finalSeat?.status).toBe('booked');
  });

  it('resolves both concurrent idempotent retries to the same ticket', async () => {
    const { seat } = await createGameWithSeat();
    const idempotencyKey = 'retry-key-1';

    const [first, second] = await Promise.all([
      bookTicket({ seatId: seat.id, userId: member.id, idempotencyKey }),
      bookTicket({ seatId: seat.id, userId: member.id, idempotencyKey }),
    ]);

    expect(first.id).toBe(second.id);

    const finalTickets = await db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.seatId, seat.id));
    expect(finalTickets).toHaveLength(1);
  });

  it('rejects reusing an idempotency key across two different seats', async () => {
    // Key reuse across seats is a client bug, not a legitimate retry — the two seats don't
    // contend on their own CAS, so this races at the ticket INSERT's idempotency-key constraint.
    const { seat: seatA } = await createGameWithSeat();
    const { seat: seatB } = await createGameWithSeat();
    const idempotencyKey = 'retry-key-cross-seat';

    const results = await Promise.allSettled([
      bookTicket({ seatId: seatA.id, userId: member.id, idempotencyKey }),
      bookTicket({ seatId: seatB.id, userId: member.id, idempotencyKey }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

    const allTicketsForKey = await db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.idempotencyKey, idempotencyKey));
    expect(allTicketsForKey).toHaveLength(1);

    // The rejected request's whole transaction rolls back (not just its insert), so its seat
    // CAS is undone too — the winner's seat ends up booked, the loser's back to available.
    const seatStatuses = await Promise.all(
      [seatA.id, seatB.id].map(async (id) => {
        const [s] = await db.select().from(seatsTable).where(eq(seatsTable.id, id));
        return s!.status;
      }),
    );
    expect(seatStatuses.sort()).toEqual(['available', 'booked']);
  });

  it('rejects a nonexistent seat with NotFoundError', async () => {
    await expect(
      bookTicket({ seatId: '00000000-0000-0000-0000-000000000000', userId: member.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects booking a season-reserved seat, leaving the holder's ticket untouched", async () => {
    const { seat } = await createGameWithSeat('reserved_season');
    const [holderTicket] = await db
      .insert(ticketsTable)
      .values({
        seatId: seat.id,
        gameId: seat.gameId,
        userId: seasonHolder.id,
        status: 'confirmed',
        priceCents: 0,
      })
      .returning();

    await expect(bookTicket({ seatId: seat.id, userId: member.id })).rejects.toBeInstanceOf(
      ConflictError,
    );

    const [unchanged] = await db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, holderTicket!.id));
    expect(unchanged).toMatchObject({
      status: 'confirmed',
      userId: seasonHolder.id,
      priceCents: 0,
    });
  });
});

describe('refundTicket', () => {
  async function bookedTicket() {
    const { seat } = await createGameWithSeat();
    const ticket = await bookTicket({ seatId: seat.id, userId: member.id });
    return { seat, ticket };
  }

  it('refunds a confirmed ticket and frees its seat', async () => {
    const { seat, ticket } = await bookedTicket();

    const refunded = await refundTicket({ ticketId: ticket.id, refundedBy: admin.id });
    expect(refunded.status).toBe('refunded');
    expect(refunded.refundedBy).toBe(admin.id);
    expect(refunded.refundedAt).not.toBeNull();

    const [freedSeat] = await db.select().from(seatsTable).where(eq(seatsTable.id, seat.id));
    expect(freedSeat?.status).toBe('available');
  });

  it('rejects a nonexistent ticket with NotFoundError', async () => {
    await expect(
      refundTicket({ ticketId: '00000000-0000-0000-0000-000000000000', refundedBy: admin.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('allows only one winner when two admins race to refund the same ticket without an idempotency key', async () => {
    const { ticket } = await bookedTicket();

    const results = await Promise.allSettled([
      refundTicket({ ticketId: ticket.id, refundedBy: admin.id }),
      refundTicket({ ticketId: ticket.id, refundedBy: admin.id }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
  });

  it('resolves concurrent retries carrying the same idempotency key to the same refunded ticket', async () => {
    const { seat, ticket } = await bookedTicket();
    const idempotencyKey = 'refund-retry-key-1';

    const [first, second] = await Promise.all([
      refundTicket({ ticketId: ticket.id, refundedBy: admin.id, idempotencyKey }),
      refundTicket({ ticketId: ticket.id, refundedBy: admin.id, idempotencyKey }),
    ]);

    expect(first.id).toBe(second.id);
    expect(first.status).toBe('refunded');
    expect(second.status).toBe('refunded');

    const [freedSeat] = await db.select().from(seatsTable).where(eq(seatsTable.id, seat.id));
    expect(freedSeat?.status).toBe('available');
  });

  it('returns the already-refunded ticket on a sequential retry with a matching idempotency key', async () => {
    const { ticket } = await bookedTicket();
    const idempotencyKey = 'refund-retry-key-2';

    const first = await refundTicket({ ticketId: ticket.id, refundedBy: admin.id, idempotencyKey });
    const second = await refundTicket({ ticketId: ticket.id, refundedBy: admin.id, idempotencyKey });

    expect(second.id).toBe(first.id);
    expect(second.status).toBe('refunded');
    expect(second.refundedBy).toBe(first.refundedBy);
  });

  it('rejects a second refund attempt with a different (or missing) idempotency key', async () => {
    const { ticket } = await bookedTicket();

    await refundTicket({ ticketId: ticket.id, refundedBy: admin.id, idempotencyKey: 'original-key' });

    await expect(
      refundTicket({ ticketId: ticket.id, refundedBy: admin.id, idempotencyKey: 'different-key' }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(refundTicket({ ticketId: ticket.id, refundedBy: admin.id })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('rejects refunding a ticket for a completed game', async () => {
    const { seat, ticket } = await bookedTicket();
    await db.update(gamesTable).set({ status: 'completed' }).where(eq(gamesTable.id, seat.gameId));

    await expect(
      refundTicket({ ticketId: ticket.id, refundedBy: admin.id }),
    ).rejects.toBeInstanceOf(ConflictError);

    const [unchanged] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, ticket.id));
    expect(unchanged?.status).toBe('confirmed');
  });
});
