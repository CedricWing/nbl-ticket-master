import { and, asc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '../../shared/database/client.js';
import { users } from '../auth/index.js';
import { tickets } from '../tickets/index.js';
import { games, seasonSeatAssignments, seats, seatTemplates, teams } from './schema.js';

const homeTeam = alias(teams, 'home_team');
const awayTeam = alias(teams, 'away_team');

const gameTicketSelection = {
  id: tickets.id,
  status: tickets.status,
  priceCents: tickets.priceCents,
  createdAt: tickets.createdAt,
  seat: { id: seats.id, section: seats.section, row: seats.row, seatNumber: seats.seatNumber },
  user: { id: users.id, name: users.name, email: users.email },
};

const gameSelection = {
  id: games.id,
  startsAt: games.startsAt,
  status: games.status,
  createdBy: games.createdBy,
  createdAt: games.createdAt,
  updatedAt: games.updatedAt,
  updatedBy: games.updatedBy,
  homeTeam: {
    id: homeTeam.id,
    name: homeTeam.name,
    city: homeTeam.city,
    homeVenue: homeTeam.homeVenue,
  },
  awayTeam: { id: awayTeam.id, name: awayTeam.name, city: awayTeam.city },
};

// --- Reads ---

export async function findTeamById(db: DbOrTx, id: string) {
  const [team] = await db.select().from(teams).where(eq(teams.id, id));
  return team;
}

export async function findAllTeams(db: DbOrTx) {
  return db.select().from(teams).orderBy(asc(teams.name));
}

export async function findUpcomingGames(db: DbOrTx) {
  return db
    .select(gameSelection)
    .from(games)
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .where(eq(games.status, 'upcoming'))
    .orderBy(asc(games.startsAt));
}

export async function findGameById(db: DbOrTx, id: string) {
  const [game] = await db
    .select(gameSelection)
    .from(games)
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .where(eq(games.id, id));
  return game;
}

export async function findSeatsByGameId(db: DbOrTx, gameId: string) {
  return db
    .select()
    .from(seats)
    .where(eq(seats.gameId, gameId))
    .orderBy(asc(seats.section), asc(seats.row), asc(seats.seatNumber));
}

export async function findSeatsInRow(db: DbOrTx, gameId: string, section: string, row: string) {
  return db
    .select()
    .from(seats)
    .where(and(eq(seats.gameId, gameId), eq(seats.section, section), eq(seats.row, row)))
    .orderBy(asc(seats.seatNumber));
}

export async function findSeatTemplates(db: DbOrTx, teamId: string) {
  return db.select().from(seatTemplates).where(eq(seatTemplates.teamId, teamId));
}

export async function findSeasonAssignmentsForSeatTemplates(db: DbOrTx, seatTemplateIds: string[]) {
  if (seatTemplateIds.length === 0) return [];
  return db
    .select()
    .from(seasonSeatAssignments)
    .where(inArray(seasonSeatAssignments.seatTemplateId, seatTemplateIds));
}

// Includes seat and holder details so tickets can be identified without knowing their raw ID.
export async function findTicketsWithDetailsByGameId(db: DbOrTx, gameId: string) {
  return db
    .select(gameTicketSelection)
    .from(tickets)
    .innerJoin(seats, eq(tickets.seatId, seats.id))
    .innerJoin(users, eq(tickets.userId, users.id))
    .where(eq(tickets.gameId, gameId))
    .orderBy(asc(seats.section), asc(seats.row), asc(seats.seatNumber));
}

// --- Creates ---

export async function insertGame(
  db: DbOrTx,
  data: { homeTeamId: string; awayTeamId: string; startsAt: Date; createdBy: string },
) {
  const [game] = await db.insert(games).values(data).returning();
  return game!; // a single-row insert().returning() always yields exactly one row
}

export async function insertSeats(
  db: DbOrTx,
  rows: Array<{
    gameId: string;
    seatTemplateId?: string;
    section: string;
    row: string;
    seatNumber: number;
    priceCents: number;
  }>,
) {
  if (rows.length === 0) return [];
  return db.insert(seats).values(rows).returning();
}

// --- Updates ---

// CAS: every valid update — a reschedule, or a status change (only 'upcoming' has any allowed
// outbound transition) — requires the game to currently be 'upcoming'. Guarding the WHERE clause
// on that, rather than trusting an earlier SELECT, closes the same read-then-write race already
// closed elsewhere in this codebase (an empty result means someone else changed it first).
export async function updateGameIfUpcoming(
  db: DbOrTx,
  id: string,
  data: Partial<{
    startsAt: Date;
    status: 'upcoming' | 'completed' | 'cancelled';
    updatedAt: Date;
    updatedBy: string;
  }>,
) {
  const [game] = await db
    .update(games)
    .set(data)
    .where(and(eq(games.id, id), eq(games.status, 'upcoming')))
    .returning();
  return game;
}

export async function updateSeatsStatus(
  db: DbOrTx,
  seatIds: string[],
  status: 'available' | 'booked' | 'reserved_season',
) {
  if (seatIds.length === 0) return;
  await db.update(seats).set({ status }).where(inArray(seats.id, seatIds));
}

// Refunds every confirmed ticket for a game (used when a game is cancelled) and frees the
// booked seats underneath them. Reserved_season seats are left alone — refunding a season
// holder's comped ticket for this game shouldn't release their seat claim on future games.
export async function refundConfirmedTicketsForGame(db: DbOrTx, gameId: string, refundedBy: string) {
  const refunded = await db
    .update(tickets)
    .set({ status: 'refunded', refundedAt: new Date(), refundedBy })
    .where(and(eq(tickets.gameId, gameId), eq(tickets.status, 'confirmed')))
    .returning({ seatId: tickets.seatId });

  const seatIds = refunded.map((ticket) => ticket.seatId);
  if (seatIds.length > 0) {
    await db
      .update(seats)
      .set({ status: 'available' })
      .where(and(inArray(seats.id, seatIds), eq(seats.status, 'booked')));
  }

  return refunded.length;
}

// --- Deletes ---

export async function deleteSeatsByIds(db: DbOrTx, seatIds: string[]) {
  if (seatIds.length === 0) return;
  await db.delete(seats).where(inArray(seats.id, seatIds));
}
