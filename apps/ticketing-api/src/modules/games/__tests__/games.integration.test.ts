import { and, eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../../shared/database/client.js';
import { BadRequestError, ConflictError } from '../../../shared/errors/index.js';
import { users } from '../../auth/index.js';
import { tickets } from '../../tickets/index.js';
import { games as gamesTable, seats as seatsTable, teams } from '../schema.js';
import { adjustCapacity, createGame, updateGame } from '../service.js';

// Seeded inventory per team: Section A (2x5) + Section B (5x10) = 60 seats.
const TOTAL_SEATS_PER_GAME = 2 * 5 + 5 * 10;

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
let seasonHolder: Awaited<ReturnType<typeof getSeededUser>>;
let melbourneUnited: Awaited<ReturnType<typeof getSeededTeam>>;
let sydneyKings: Awaited<ReturnType<typeof getSeededTeam>>;

const futureDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

// Games (and, for one test, a throwaway team) get created fresh per test and torn down in
// afterEach below, so each test starts from the same seeded baseline instead of leftover state.
const createdGameIds: string[] = [];
const createdTeamIds: string[] = [];

// Load shared fixtures once. All tests read these, none of them mutate them.
beforeAll(async () => {
  admin = await getSeededUser('admin@example.com');
  seasonHolder = await getSeededUser('season@example.com');
  melbourneUnited = await getSeededTeam('Melbourne United');
  sydneyKings = await getSeededTeam('Sydney Kings');
});

// Delete in FK-dependency order: tickets reference seats, seats reference games.
afterEach(async () => {
  for (const gameId of createdGameIds) {
    await db.delete(tickets).where(eq(tickets.gameId, gameId));
    await db.delete(seatsTable).where(eq(seatsTable.gameId, gameId));
    await db.delete(gamesTable).where(eq(gamesTable.id, gameId));
  }
  createdGameIds.length = 0;

  for (const teamId of createdTeamIds) {
    await db.delete(teams).where(eq(teams.id, teamId));
  }
  createdTeamIds.length = 0;
});

describe('createGame', () => {
  it("copies the home team's seat inventory and honors the seeded season assignment", async () => {
    const game = await createGame({
      homeTeamId: melbourneUnited.id,
      awayTeamId: sydneyKings.id,
      startsAt: futureDate(),
      createdBy: admin.id,
    });
    createdGameIds.push(game.id);

    expect(game.seats).toHaveLength(TOTAL_SEATS_PER_GAME);
    expect(game.homeTeam.name).toBe('Melbourne United');
    expect(game.awayTeam.name).toBe('Sydney Kings');

    // Seeded assignment: season holder owns Melbourne United, Section A, Row 1, Seat 1.
    const seasonSeat = game.seats.find(
      (seat) => seat.section === 'A' && seat.row === '1' && seat.seatNumber === 1,
    );
    expect(seasonSeat?.status).toBe('reserved_season');

    const [autoTicket] = await db.select().from(tickets).where(eq(tickets.seatId, seasonSeat!.id));
    expect(autoTicket).toMatchObject({
      userId: seasonHolder.id,
      status: 'confirmed',
      priceCents: 0,
    });

    const otherSeat = game.seats.find(
      (seat) => !(seat.section === 'A' && seat.row === '1' && seat.seatNumber === 1),
    );
    expect(otherSeat?.status).toBe('available');
  });

  it('rejects identical home/away teams with BadRequestError', async () => {
    await expect(
      createGame({
        homeTeamId: melbourneUnited.id,
        awayTeamId: melbourneUnited.id,
        startsAt: futureDate(),
        createdBy: admin.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects a home team with no seat inventory configured', async () => {
    const [newTeam] = await db
      .insert(teams)
      .values({ name: 'Test Only FC', city: 'Nowhere', homeVenue: 'Test Arena' })
      .returning();
    createdTeamIds.push(newTeam!.id);

    await expect(
      createGame({
        homeTeamId: newTeam!.id,
        awayTeamId: sydneyKings.id,
        startsAt: futureDate(),
        createdBy: admin.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe('getGameById / updateGame', () => {
  it('updates status and records the actor', async () => {
    const game = await createGame({
      homeTeamId: melbourneUnited.id,
      awayTeamId: sydneyKings.id,
      startsAt: futureDate(),
      createdBy: admin.id,
    });
    createdGameIds.push(game.id);

    const updated = await updateGame(game.id, { status: 'cancelled', updatedBy: admin.id });
    expect(updated.status).toBe('cancelled');
    expect(updated.updatedBy).toBe(admin.id);
    expect(updated.updatedAt).not.toBeNull();
  });
});

describe('adjustCapacity', () => {
  // Sydney Kings as home team (no season assignment), Section B (10 seats, unrelated to the
  // Section A season-reserved seat) — isolates these tests from season-assignment behavior.
  async function makeGame() {
    const game = await createGame({
      homeTeamId: sydneyKings.id,
      awayTeamId: melbourneUnited.id,
      startsAt: futureDate(),
      createdBy: admin.id,
    });
    createdGameIds.push(game.id);
    return game;
  }

  it('increases capacity by appending seats to the row', async () => {
    const game = await makeGame();
    const seats = await adjustCapacity(game.id, {
      section: 'B',
      row: '1',
      delta: 3,
      priceCents: 4500,
    });
    const sectionBRow1 = seats.filter((s) => s.section === 'B' && s.row === '1');
    expect(sectionBRow1).toHaveLength(13);
  });

  it('requires priceCents when increasing capacity', async () => {
    const game = await makeGame();
    await expect(
      adjustCapacity(game.id, { section: 'B', row: '1', delta: 2 }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('decreases capacity by removing available seats from the end of the row', async () => {
    const game = await makeGame();
    const seats = await adjustCapacity(game.id, { section: 'B', row: '1', delta: -2 });
    const sectionBRow1 = seats.filter((s) => s.section === 'B' && s.row === '1');
    expect(sectionBRow1).toHaveLength(8);
  });

  it('rejects decreasing past the available seat count', async () => {
    const game = await makeGame();
    await expect(
      adjustCapacity(game.id, { section: 'B', row: '1', delta: -20 }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  // Both tests below need one real seat row to force into a specific state (booked, or
  // carrying refunded-ticket history) before calling adjustCapacity against it.
  async function getFirstSeatInRow(gameId: string, section: string, row: string) {
    const [seat] = await db
      .select()
      .from(seatsTable)
      .where(
        and(
          eq(seatsTable.gameId, gameId),
          eq(seatsTable.section, section),
          eq(seatsTable.row, row),
        ),
      )
      .orderBy(seatsTable.seatNumber);
    return seat!;
  }

  it('rejects removing a seat that is booked', async () => {
    const game = await makeGame();
    const seat = await getFirstSeatInRow(game.id, 'B', '1');
    await db.update(seatsTable).set({ status: 'booked' }).where(eq(seatsTable.id, seat.id));

    await expect(
      adjustCapacity(game.id, { section: 'B', row: '1', delta: -10 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects removing a seat that has ticket history even if it is available again', async () => {
    const game = await makeGame();
    const seat = await getFirstSeatInRow(game.id, 'B', '1');
    // Simulate a booked-then-refunded seat: status is back to 'available', but a ticket row
    // still references it — deleting the seat would orphan that ticket's FK.
    await db.insert(tickets).values({
      seatId: seat.id,
      gameId: game.id,
      userId: seasonHolder.id,
      status: 'refunded',
      priceCents: 4500,
      refundedAt: new Date(),
      refundedBy: admin.id,
    });

    await expect(
      adjustCapacity(game.id, { section: 'B', row: '1', delta: -10 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
