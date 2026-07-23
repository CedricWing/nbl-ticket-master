import { db, type DbOrTx } from '../../shared/database/client.js';
import { isForeignKeyViolation, isUniqueViolation } from '../../shared/database/errors.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../shared/errors/index.js';
import * as repo from './repository.js';

export interface BookTicketInput {
  seatId: string;
  userId: string;
  idempotencyKey?: string | undefined;
}

export async function bookTicket(input: BookTicketInput) {
  try {
    return await db.transaction(async (tx) => {
      const seat = await repo.findSeatById(tx, input.seatId);
      if (!seat) throw new NotFoundError('Seat not found');

      const existing = await findExistingIdempotentTicket(tx, input);
      if (existing) return resolveIdempotentBooking(existing, input);

      const game = await repo.findGameByIdForBooking(tx, seat.gameId);
      if (!game) throw new NotFoundError('Game not found');
      if (game.status !== 'upcoming') {
        throw new ConflictError('Game is not open for bookings');
      }
      if (game.startsAt.getTime() <= Date.now()) {
        throw new ConflictError('Game has already started');
      }

      // Atomic cas. For mulitple bookers, only 1 fulfill the where cond
      const [bookedSeat] = await repo.bookSeatIfAvailable(tx, input.seatId);
      if (!bookedSeat) {
        // Might just be our own retry losing the race to itself
        const retried = await findExistingIdempotentTicket(tx, input);
        if (retried) return resolveIdempotentBooking(retried, input);
        throw new ConflictError('Seat is no longer available');
      }

      return await repo.insertTicket(tx, {
        seatId: input.seatId,
        gameId: seat.gameId,
        userId: input.userId,
        priceCents: seat.priceCents, // server-computed from the seat — never from the request
        idempotencyKey: input.idempotencyKey,
      });
    });
  } catch (err) {
    // Transaction already rolled back by now, so recovery below is a fresh query, not inside it.
    if (isUniqueViolation(err, 'tickets_active_seat_unique')) {
      throw new ConflictError('Seat is no longer available');
    }
    //Fetch and return the winning row instead (now avail hence it threw)
    if (isUniqueViolation(err, 'tickets_user_idempotency_key_unique')) {
      const existing = await findExistingIdempotentTicket(db, input);
      if (existing) return resolveIdempotentBooking(existing, input);
    }
    // A previously-valid JWT can still reach here for a user deleted after the token was issued.
    if (isForeignKeyViolation(err, 'tickets_user_id_users_id_fk')) {
      throw new UnauthorizedError('User account no longer exists');
    }
    throw err;
  }
}

async function findExistingIdempotentTicket(tx: DbOrTx, input: BookTicketInput) {
  if (input.idempotencyKey === undefined) return undefined;
  return repo.findTicketByIdempotencyKey(tx, input.userId, input.idempotencyKey);
}

// Only counts as a retry if it's for the same seat, not just the same key.
function resolveIdempotentBooking<T extends { seatId: string }>(
  existing: T,
  input: BookTicketInput,
): T {
  if (existing.seatId !== input.seatId) {
    throw new ConflictError('Idempotency key was already used for a different seat');
  }
  return existing;
}

export interface RefundTicketInput {
  ticketId: string;
  refundedBy: string;
  idempotencyKey?: string | undefined;
}

// Only counts as a retry if the idempotency key matches, not just the ticket.
function isMatchingRefundRetry(
  ticket: { refundIdempotencyKey: string | null },
  input: RefundTicketInput,
): boolean {
  return input.idempotencyKey !== undefined && ticket.refundIdempotencyKey === input.idempotencyKey;
}

export async function refundTicket(input: RefundTicketInput) {
  try {
    return await db.transaction(async (tx) => {
      const ticket = await repo.findTicketById(tx, input.ticketId);
      if (!ticket) throw new NotFoundError('Ticket not found');

      if (ticket.status === 'refunded') {
        if (isMatchingRefundRetry(ticket, input)) return ticket;
        throw new ConflictError('Ticket already refunded');
      }

      const game = await repo.findGameById(tx, ticket.gameId);
      if (!game) throw new NotFoundError('Game not found');
      if (game.status === 'completed') {
        throw new ConflictError('Cannot refund a ticket for a completed game');
      }

      // A second concurrent refund attempt gets an empty array back here (lost the race).
      const [refunded] = await repo.refundTicketIfConfirmed(
        tx,
        input.ticketId,
        input.refundedBy,
        input.idempotencyKey,
      );
      if (!refunded) {
        const winner = await repo.findTicketById(tx, input.ticketId);
        if (winner?.status === 'refunded' && isMatchingRefundRetry(winner, input)) return winner;
        throw new ConflictError('Ticket already refunded');
      }

      await repo.freeSeat(tx, refunded.seatId);
      return refunded;
    });
  } catch (err) {
    if (isForeignKeyViolation(err, 'tickets_refunded_by_users_id_fk')) {
      throw new UnauthorizedError('User account no longer exists');
    }
    throw err;
  }
}

export async function listMyTickets(userId: string) {
  return repo.findTicketsByUserId(db, userId);
}
