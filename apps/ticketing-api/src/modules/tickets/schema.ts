import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/schema.js';
import { games, seats } from '../games/schema.js';

export const ticketStatusEnum = pgEnum('ticket_status', ['confirmed', 'refunded']);

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    seatId: uuid('seat_id')
      .notNull()
      .references(() => seats.id),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: ticketStatusEnum('status').notNull().default('confirmed'),
    priceCents: integer('price_cents').notNull(),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    refundedBy: uuid('refunded_by').references(() => users.id),
    // Separate from `idempotencyKey` above (which dedupes bookings by userId) — this dedupes a
    // refund action itself, since refunding updates an existing row rather than inserting one.
    refundIdempotencyKey: text('refund_idempotency_key'),
  },
  (table) => [
    // Restricts one confirmed ticket per seat
    // Exception are refunded tickets. Refunded tickets can be rebooked
    uniqueIndex('tickets_active_seat_unique')
      .on(table.seatId)
      .where(sql`${table.status} = 'confirmed'`),
    // Scoped to confirmed tickets, mirroring tickets_active_seat_unique above — once a ticket
    // is refunded its idempotency key is free to be reused for a new booking.
    uniqueIndex('tickets_user_idempotency_key_unique')
      .on(table.userId, table.idempotencyKey)
      .where(sql`${table.status} = 'confirmed'`),
    // For detailed lookups
    index('tickets_user_id_idx').on(table.userId),
    index('tickets_game_id_idx').on(table.gameId),
    //price check
    check('tickets_price_non_negative', sql`${table.priceCents} >= 0`),
    // Consistency check ebtween status and refunded_at, lists valid permutations
    check(
      'tickets_refund_consistency',
      sql`(status = 'confirmed' AND refunded_at IS NULL AND refunded_by IS NULL)
        OR (status = 'refunded' AND refunded_at IS NOT NULL AND refunded_by IS NOT NULL)`,
    ),
  ],
);
