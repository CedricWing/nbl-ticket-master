import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticate, requireRole } from '../auth/index.js';
import { BadRequestError } from '../../shared/errors/index.js';
import * as ticketsService from './service.js';

const idParamsSchema = z.object({ id: z.string().uuid() });

const bookTicketBodySchema = z.object({
  seatId: z.string().uuid(),
});

const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

function readIdempotencyKey(headerValue: unknown): string | undefined {
  const idempotencyKey =
    typeof headerValue === 'string' && headerValue !== '' ? headerValue : undefined;

  if (idempotencyKey !== undefined && idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new BadRequestError(
      `Idempotency-Key header must not exceed ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
    );
  }

  return idempotencyKey;
}

export const ticketsRouter: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    { preHandler: [authenticate], schema: { security: [{ bearerAuth: [] }], tags: ['Tickets'] } },
    async (request) => {
      const tickets = await ticketsService.listMyTickets(request.user.sub);
      return { tickets };
    },
  );

  app.post(
    '/',
    {
      preHandler: [authenticate],
      schema: { body: bookTicketBodySchema, security: [{ bearerAuth: [] }], tags: ['Tickets'] },
    },
    async (request, reply) => {
      const idempotencyKey = readIdempotencyKey(request.headers['idempotency-key']);

      const ticket = await ticketsService.bookTicket({
        seatId: request.body.seatId,
        userId: request.user.sub,
        idempotencyKey,
      });
      reply.status(201);
      return ticket;
    },
  );

  app.post(
    '/:id/refund',
    {
      preHandler: [authenticate, requireRole('admin')],
      schema: { params: idParamsSchema, security: [{ bearerAuth: [] }], tags: ['Tickets'] },
    },
    async (request) => {
      const idempotencyKey = readIdempotencyKey(request.headers['idempotency-key']);

      return ticketsService.refundTicket({
        ticketId: request.params.id,
        refundedBy: request.user.sub,
        idempotencyKey,
      });
    },
  );
};
