import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Pure RBAC
export const roleEnum = pgEnum('role', ['member', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
