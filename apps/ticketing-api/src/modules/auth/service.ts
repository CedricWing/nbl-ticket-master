import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/database/client.js';
import { UnauthorizedError } from '../../shared/errors/index.js';
import { users } from './schema.js';

export interface LoginInput {
  email: string;
  password: string;
}

export async function login({ email, password }: LoginInput) {
  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return user;
}
