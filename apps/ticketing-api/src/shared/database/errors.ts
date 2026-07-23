import postgres from 'postgres';

const { PostgresError } = postgres;
type PostgresError = InstanceType<typeof PostgresError>;

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

// Drizzle wraps driver errors in its own DrizzleQueryError, with the real PostgresError as
// .cause — so the raw error has to be unwrapped before its code/constraint can be checked.
function toPostgresError(err: unknown): PostgresError | undefined {
  if (err instanceof PostgresError) return err;
  if (err instanceof Error && err.cause instanceof PostgresError) return err.cause;
  return undefined;
}

function isPostgresError(err: unknown, code: string, constraintName?: string): boolean {
  const pgErr = toPostgresError(err);
  if (!pgErr || pgErr.code !== code) {
    return false;
  }
  return constraintName === undefined || pgErr.constraint_name === constraintName;
}

export function isUniqueViolation(err: unknown, constraintName?: string): boolean {
  return isPostgresError(err, UNIQUE_VIOLATION, constraintName);
}

export function isForeignKeyViolation(err: unknown, constraintName?: string): boolean {
  return isPostgresError(err, FOREIGN_KEY_VIOLATION, constraintName);
}

export function isCheckViolation(err: unknown, constraintName?: string): boolean {
  return isPostgresError(err, CHECK_VIOLATION, constraintName);
}
