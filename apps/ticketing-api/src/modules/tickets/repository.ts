import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '../../shared/database/client.js';
import { games, seats, teams } from '../games/index.js';
import { tickets } from './schema.js';

const homeTeam = alias(teams, 'home_team');
const awayTeam = alias(teams, 'away_team');

// Drizzle's typed select() only supports one level of object grouping, so home/away team stay
// as sibling groups here rather than nested under `game` — findTicketsByUserId reshapes them
// into the nested shape the API actually returns.
const myTicketSelection = {
  id: tickets.id,
  status: tickets.status,
  priceCents: tickets.priceCents,
  createdAt: tickets.createdAt,
  seat: {
    id: seats.id,
    section: seats.section,
    row: seats.row,
    seatNumber: seats.seatNumber,
    status: seats.status,
  },
  game: { id: games.id, startsAt: games.startsAt, status: games.status },
  homeTeam: { id: homeTeam.id, name: homeTeam.name, city: homeTeam.city, homeVenue: homeTeam.homeVenue },
  awayTeam: { id: awayTeam.id, name: awayTeam.name, city: awayTeam.city },
};

// --- Reads ---

export async function findSeatById(db: DbOrTx, seatId: string) {
  const [seat] = await db.select().from(seats).where(eq(seats.id, seatId));
  return seat;
}

export async function findGameById(db: DbOrTx, gameId: string) {
  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  return game;
}

// Same lookup, but locks the row so a concurrent cancellation can't slip past this check.
export async function findGameByIdForBooking(db: DbOrTx, gameId: string) {
  const [game] = await db.select().from(games).where(eq(games.id, gameId)).for('share');
  return game;
}

export async function findTicketsByUserId(db: DbOrTx, userId: string) {
  const rows = await db
    .select(myTicketSelection)
    .from(tickets)
    .innerJoin(seats, eq(tickets.seatId, seats.id))
    .innerJoin(games, eq(tickets.gameId, games.id))
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .where(eq(tickets.userId, userId))
    .orderBy(asc(games.startsAt));

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    priceCents: row.priceCents,
    createdAt: row.createdAt,
    seat: row.seat,
    game: { ...row.game, homeTeam: row.homeTeam, awayTeam: row.awayTeam },
  }));
}

export async function findTicketById(db: DbOrTx, id: string) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
  return ticket;
}

export async function findTicketByIdempotencyKey(
  db: DbOrTx,
  userId: string,
  idempotencyKey: string,
) {
  // Scoped to confirmed tickets — a refunded ticket's idempotency key is reusable, so it must
  // not be returned as a match for a new booking (see tickets_user_idempotency_key_unique).
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.userId, userId),
        eq(tickets.idempotencyKey, idempotencyKey),
        eq(tickets.status, 'confirmed'),
      ),
    );
  return ticket;
}

// --- Creates ---

export async function insertTicket(
  db: DbOrTx,
  data: {
    seatId: string;
    gameId: string;
    userId: string;
    priceCents: number;
    idempotencyKey?: string | undefined;
  },
) {
  const [ticket] = await db.insert(tickets).values(data).returning();
  return ticket!;
}

// --- Updates ---

export async function bookSeatIfAvailable(db: DbOrTx, seatId: string) {
  return db
    .update(seats)
    .set({ status: 'booked' })
    .where(and(eq(seats.id, seatId), eq(seats.status, 'available')))
    .returning();
}

export async function freeSeat(db: DbOrTx, seatId: string) {
  // Only downgrades a normally-booked seat. A reserved_season seat must stay reserved for its
  // season holder even if the comped ticket sitting on top of it gets refunded.
  await db
    .update(seats)
    .set({ status: 'available' })
    .where(and(eq(seats.id, seatId), eq(seats.status, 'booked')));
}

export async function refundTicketIfConfirmed(
  db: DbOrTx,
  ticketId: string,
  refundedBy: string,
  idempotencyKey?: string | undefined,
) {
  return db
    .update(tickets)
    .set({
      status: 'refunded',
      refundedAt: new Date(),
      refundedBy,
      refundIdempotencyKey: idempotencyKey ?? null,
    })
    .where(and(eq(tickets.id, ticketId), eq(tickets.status, 'confirmed')))
    .returning();
}
