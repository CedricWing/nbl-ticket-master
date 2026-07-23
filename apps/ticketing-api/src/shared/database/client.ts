import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './index.js';

try {
  process.loadEnvFile();
} catch {
  // no .env file — env vars provided by the environment (Docker/CI)
}

const queryClient = postgres(process.env.DATABASE_URL!, {
  connect_timeout: 10,
  idle_timeout: 30,
  connection: { statement_timeout: 15000 },
});

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
// The handle passed into a db.transaction(async (tx) => {...}) callback — derived from
// Database itself so repository/service functions can accept either db or tx and
// participate transparently in a caller's existing transaction.
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbOrTx = Database | Transaction;
