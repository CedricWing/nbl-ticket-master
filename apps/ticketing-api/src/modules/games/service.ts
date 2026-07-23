import { inArray } from 'drizzle-orm';
import { db, type DbOrTx } from '../../shared/database/client.js';
import {
  isCheckViolation,
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../shared/database/errors.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../shared/errors/index.js';
import { tickets } from '../tickets/index.js';
import * as repo from './repository.js';

export interface CreateGameInput {
  homeTeamId: string;
  awayTeamId: string;
  startsAt: Date;
  createdBy: string;
}

export async function createGame(input: CreateGameInput) {
  if (input.homeTeamId === input.awayTeamId) {
    throw new BadRequestError('homeTeamId and awayTeamId must be different');
  }

  return db.transaction(async (tx) => {
    // Look up the two teams so their names/venue can be returned without a second round trip.
    const { homeTeam, awayTeam } = await findHomeAndAwayTeamsOrThrow(
      tx,
      input.homeTeamId,
      input.awayTeamId,
    );
    const game = await insertGameRow(tx, input);
    // Snapshot the home team's seat templates into real, bookable seats for this game.
    const { seatTemplates, insertedSeats } = await copySeatTemplates(tx, game.id, input.homeTeamId);
    // Auto-issue tickets for season pass holders
    await reserveSeasonAssignedSeats(tx, game.id, seatTemplates, insertedSeats);

    // Re-fetch seats so the response reflects any status changes from the reservation step above.
    const finalSeats = await repo.findSeatsByGameId(tx, game.id);
    return {
      id: game.id,
      startsAt: game.startsAt,
      status: game.status,
      createdBy: game.createdBy,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      updatedBy: game.updatedBy,
      homeTeam,
      awayTeam,
      seats: finalSeats,
    };
  });
}

async function findHomeAndAwayTeamsOrThrow(tx: DbOrTx, homeTeamId: string, awayTeamId: string) {
  const [homeTeam, awayTeam] = await Promise.all([
    repo.findTeamById(tx, homeTeamId),
    repo.findTeamById(tx, awayTeamId),
  ]);
  if (!homeTeam) throw new NotFoundError('Home team not found');
  if (!awayTeam) throw new NotFoundError('Away team not found');
  return { homeTeam, awayTeam };
}

async function insertGameRow(tx: DbOrTx, input: CreateGameInput) {
  try {
    return await repo.insertGame(tx, {
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      startsAt: input.startsAt,
      createdBy: input.createdBy,
    });
  } catch (err) {
    // Backup check in case the upfront validation in createGame is ever bypassed.
    if (isCheckViolation(err, 'games_distinct_teams')) {
      throw new BadRequestError('homeTeamId and awayTeamId must be different');
    }
    throw err;
  }
}

// Copies the home team's seat templates into this game's own seats.
async function copySeatTemplates(tx: DbOrTx, gameId: string, teamId: string) {
  const seatTemplates = await repo.findSeatTemplates(tx, teamId);
  if (seatTemplates.length === 0) {
    throw new BadRequestError('Home team has no seat inventory configured');
  }

  const insertedSeats = await repo.insertSeats(
    tx,
    seatTemplates.map((seatTemplate) => ({
      gameId,
      seatTemplateId: seatTemplate.id,
      section: seatTemplate.section,
      row: seatTemplate.row,
      seatNumber: seatTemplate.seatNumber,
      priceCents: seatTemplate.priceCents,
    })),
  );

  return { seatTemplates, insertedSeats };
}

// Flags any matching season-pass seats reserved_season and auto-issues their comped tickets.
async function reserveSeasonAssignedSeats(
  tx: DbOrTx,
  gameId: string,
  seatTemplates: Awaited<ReturnType<typeof repo.findSeatTemplates>>,
  insertedSeats: Awaited<ReturnType<typeof repo.insertSeats>>,
) {
  // Find which of this game's seat templates have a season ticket holder assigned to them.
  const seatTemplateIds = seatTemplates.map((seatTemplate) => seatTemplate.id);
  const assignments = await repo.findSeasonAssignmentsForSeatTemplates(tx, seatTemplateIds);
  if (assignments.length === 0) return;

  // Map each assignment's seat template back to the concrete seat just created for this game.
  const seatsBySeatTemplateId = new Map(insertedSeats.map((seat) => [seat.seatTemplateId, seat]));
  const reservedSeatIds: string[] = [];

  for (const assignment of assignments) {
    const seat = seatsBySeatTemplateId.get(assignment.seatTemplateId);
    if (!seat) continue; // every seat template was just copied above, so this can't miss

    reservedSeatIds.push(seat.id);
    // Comp a free, pre-confirmed ticket for the season ticket holder — no booking step needed.
    await tx.insert(tickets).values({
      seatId: seat.id,
      gameId,
      userId: assignment.userId,
      status: 'confirmed',
      priceCents: 0,
    });
  }

  // Mark these seats as season-reserved so they can't also be booked by another user.
  if (reservedSeatIds.length > 0) {
    await repo.updateSeatsStatus(tx, reservedSeatIds, 'reserved_season');
  }
}

export async function findUpcomingGames() {
  return repo.findUpcomingGames(db);
}

export async function listTeams() {
  return repo.findAllTeams(db);
}

async function findGameOrThrow(db: DbOrTx, id: string) {
  const game = await repo.findGameById(db, id);
  if (!game) throw new NotFoundError('Game not found');
  return game;
}

export async function getGameById(id: string) {
  const game = await findGameOrThrow(db, id);
  const gameSeats = await repo.findSeatsByGameId(db, id);
  return { ...game, seats: gameSeats };
}

export async function listGameTickets(gameId: string) {
  await findGameOrThrow(db, gameId);
  return repo.findTicketsWithDetailsByGameId(db, gameId);
}

export type GameStatus = 'upcoming' | 'completed' | 'cancelled';

export interface UpdateGameInput {
  startsAt?: Date;
  status?: GameStatus;
  updatedBy: string;
}

// upcoming is the only non-terminal state; completed/cancelled can't transition anywhere else.
// (Not a DB CHECK constraint: those can only see the new row, not the previous status —
// enforcing this at the DB level would need a trigger, which felt like overkill here.)
const ALLOWED_STATUS_TRANSITIONS: Record<GameStatus, GameStatus[]> = {
  upcoming: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export async function updateGame(id: string, input: UpdateGameInput) {
  try {
    return await db.transaction(async (tx) => {
      const game = await findGameOrThrow(tx, id);

      if (input.status !== undefined && input.status !== game.status) {
        if (!ALLOWED_STATUS_TRANSITIONS[game.status].includes(input.status)) {
          throw new ConflictError(`Cannot change game status from ${game.status} to ${input.status}`);
        }
      }

      if (input.startsAt !== undefined && game.status !== 'upcoming') {
        throw new ConflictError('Cannot reschedule a game that is not upcoming');
      }

      const updated = await repo.updateGameIfUpcoming(tx, id, {
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
        updatedBy: input.updatedBy,
      });
      // The checks above read game.status before this write — if another update (e.g. a
      // cancellation) beat this one to it, the CAS above matches zero rows here.
      if (!updated) {
        throw new ConflictError('Game was modified concurrently, please retry');
      }

      // Cancelling a game refunds everyone holding a confirmed ticket for it.
      if (input.status === 'cancelled') {
        await repo.refundConfirmedTicketsForGame(tx, id, input.updatedBy);
      }

      return findGameOrThrow(tx, id);
    });
  } catch (err) {
    // A previously-valid JWT can still reach here for an admin deleted after the token was issued.
    if (isForeignKeyViolation(err, 'tickets_refunded_by_users_id_fk')) {
      throw new UnauthorizedError('User account no longer exists');
    }
    throw err;
  }
}

export interface AdjustCapacityInput {
  section: string;
  row: string;
  delta: number;
  priceCents?: number | undefined;
}

export async function adjustCapacity(gameId: string, input: AdjustCapacityInput) {
  return db.transaction(async (tx) => {
    const game = await findGameOrThrow(tx, gameId);
    if (game.status !== 'upcoming') {
      throw new ConflictError('Cannot adjust capacity for a game that is not upcoming');
    }

    const existingSeats = await repo.findSeatsInRow(tx, gameId, input.section, input.row);

    if (input.delta > 0) {
      // Adding: Append new seats to the end of the existing row
      if (input.priceCents === undefined) {
        throw new BadRequestError('priceCents is required when increasing capacity');
      }
      const maxSeatNumber = existingSeats.reduce((max, seat) => Math.max(max, seat.seatNumber), 0);
      const newSeats = Array.from({ length: input.delta }, (_, i) => ({
        gameId,
        section: input.section,
        row: input.row,
        seatNumber: maxSeatNumber + i + 1,
        priceCents: input.priceCents!,
      }));
      try {
        await repo.insertSeats(tx, newSeats);
      } catch (err) {
        // Two concurrent increases on the same row can collide on seat number.
        if (isUniqueViolation(err, 'seats_game_seat_unique')) {
          throw new ConflictError('Capacity for this row changed concurrently, please retry');
        }
        throw err;
      }
    } else {
      // Removing: pick candidates from the end of the row and validate they're safe to remove.
      const removeCount = Math.abs(input.delta);
      if (existingSeats.length < removeCount) {
        throw new BadRequestError('Cannot remove more seats than exist in this row');
      }

      // Trim from the end of the row (highest seat numbers first)
      const candidates = existingSeats.slice(-removeCount);
      if (candidates.some((seat) => seat.status !== 'available')) {
        throw new ConflictError(
          'Cannot remove seats that are booked or reserved for a season ticket holder',
        );
      }

      // Extra safeguard. Seats can carry refunded tickets even while marked 'available'.
      const seatIds = candidates.map((seat) => seat.id);
      const ticketCount = await countTicketsForSeats(tx, seatIds);
      if (ticketCount > 0) {
        throw new ConflictError('Cannot remove seats that have ticket history');
      }

      try {
        await repo.deleteSeatsByIds(tx, seatIds);
      } catch (err) {
        // Check above should prevent this but the FK constraint is the actual source of truth if it doesn't.
        if (isForeignKeyViolation(err)) {
          throw new ConflictError('Cannot remove seats that have ticket history');
        }
        throw err;
      }
    }

    return repo.findSeatsByGameId(tx, gameId);
  });
}

async function countTicketsForSeats(tx: DbOrTx, seatIds: string[]): Promise<number> {
  if (seatIds.length === 0) return 0;
  const rows = await tx
    .select({ seatId: tickets.seatId })
    .from(tickets)
    .where(inArray(tickets.seatId, seatIds));
  return rows.length;
}
