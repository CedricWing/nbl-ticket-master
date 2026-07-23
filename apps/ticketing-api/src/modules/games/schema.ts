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

export const gameStatusEnum = pgEnum('game_status', ['upcoming', 'completed', 'cancelled']);
export const seatStatusEnum = pgEnum('seat_status', ['available', 'booked', 'reserved_season']);

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  city: text('city').notNull(),
  homeVenue: text('home_venue').notNull(),
});

// Template seats for a team's home venue — one row per physical seat. A game's actual `seats`
// rows are copied from these at creation time; this table is never booked directly.
export const seatTemplates = pgTable(
  'seat_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id),
    section: text('section').notNull(),
    row: text('row').notNull(),
    seatNumber: integer('seat_number').notNull(),
    priceCents: integer('price_cents').notNull(),
  },
  (table) => [
    uniqueIndex('seat_templates_seat_unique').on(
      table.teamId,
      table.section,
      table.row,
      table.seatNumber,
    ),
    check('seat_templates_price_non_negative', sql`${table.priceCents} >= 0`),
  ],
);

// A season ticket holder's claim on one specific seat template.
export const seasonSeatAssignments = pgTable('season_seat_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  seatTemplateId: uuid('seat_template_id')
    .notNull()
    .unique()
    .references(() => seatTemplates.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const games = pgTable(
  'games',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    homeTeamId: uuid('home_team_id')
      .notNull()
      .references(() => teams.id),
    awayTeamId: uuid('away_team_id')
      .notNull()
      .references(() => teams.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    status: gameStatusEnum('status').notNull().default('upcoming'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => [
    // A team can't play itself; the venue is derived from the home team's homeVenue,
    check('games_distinct_teams', sql`${table.homeTeamId} <> ${table.awayTeamId}`),
    index('games_status_starts_at_idx').on(table.status, table.startsAt),
  ],
);

export const seats = pgTable(
  'seats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    seatTemplateId: uuid('seat_template_id').references(() => seatTemplates.id),
    section: text('section').notNull(),
    row: text('row').notNull(),
    seatNumber: integer('seat_number').notNull(),
    priceCents: integer('price_cents').notNull(),
    status: seatStatusEnum('status').notNull().default('available'),
  },
  (table) => [
    // Two seats can't occupy the same physical spot in the same game's seat map.
    uniqueIndex('seats_game_seat_unique').on(
      table.gameId,
      table.section,
      table.row,
      table.seatNumber,
    ),
    // Backs the seat-map query
    index('seats_game_id_idx').on(table.gameId),
    check('seats_price_non_negative', sql`${table.priceCents} >= 0`),
  ],
);
