import type { FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError } from '../../shared/errors/index.js';
import type { Role } from './types.js';

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  await request.jwtVerify();
}

export function requireRole(...roles: Role[]) {
  return async function requireRolePreHandler(request: FastifyRequest, _reply: FastifyReply) {
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
  };
}
