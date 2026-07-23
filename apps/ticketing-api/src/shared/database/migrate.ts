import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

try {
  process.loadEnvFile();
} catch {
  // no .env file — env vars provided by the environment (Docker/CI)
}

// A dedicated single-connection client: migrations must run sequentially,
// so pooling here would only add risk of two connections racing on DDL.
const migrationClient = postgres(process.env.DATABASE_URL!, { max: 1 });

await migrate(drizzle(migrationClient), { migrationsFolder: './drizzle' });
await migrationClient.end();

console.log('Migrations applied');
