import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../errors/index.js';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    return reply.status(400).send({ error: 'Validation failed', details: error.validation });
  }

  // Errors thrown by trusted Fastify plugins (e.g. @fastify/jwt on a missing/invalid/expired
  // token) already carry a correct client-facing statusCode and message — pass those through
  // rather than re-wrapping them, but only below 500: a plugin bug that surfaces as 5xx should
  // still be logged and masked like any other unexpected error.
  if (typeof error.statusCode === 'number' && error.statusCode < 500) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  request.log.error(error);
  return reply.status(500).send({ error: 'Internal server error' });
}
