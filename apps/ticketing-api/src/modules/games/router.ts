import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticate, requireRole } from '../auth/index.js';
import * as gamesService from './service.js';

const idParamsSchema = z.object({ id: z.string().uuid() });

const createGameBodySchema = z
  .object({
    homeTeamId: z.string().uuid(),
    awayTeamId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
  })
  .refine((data) => data.homeTeamId !== data.awayTeamId, {
    message: 'homeTeamId and awayTeamId must be different',
    path: ['awayTeamId'],
  })
  .refine((data) => new Date(data.startsAt).getTime() > Date.now(), {
    message: 'startsAt must be in the future',
    path: ['startsAt'],
  });

const updateGameBodySchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }).optional(),
    status: z.enum(['upcoming', 'completed', 'cancelled']).optional(),
  })
  .refine((data) => data.startsAt !== undefined || data.status !== undefined, {
    message: 'At least one of startsAt or status must be provided',
  })
  .refine((data) => data.startsAt === undefined || new Date(data.startsAt).getTime() > Date.now(), {
    message: 'startsAt must be in the future',
    path: ['startsAt'],
  });

const capacityBodySchema = z
  .object({
    section: z.string().min(1),
    row: z.string().min(1),
    delta: z
      .number()
      .int()
      .refine((n) => n !== 0, 'delta must not be zero'),
    priceCents: z.number().int().nonnegative().optional(),
  })
  .refine((data) => data.delta <= 0 || data.priceCents !== undefined, {
    message: 'priceCents is required when increasing capacity',
    path: ['priceCents'],
  });

export const gamesRouter: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { schema: { tags: ['Games'] } }, async () => {
    const games = await gamesService.findUpcomingGames();
    return { games };
  });

  app.get(
    '/:id',
    { schema: { params: idParamsSchema, tags: ['Games'] } },
    async (request) => {
      return gamesService.getGameById(request.params.id);
    },
  );

  app.post(
    '/',
    {
      preHandler: [authenticate, requireRole('admin')],
      schema: { body: createGameBodySchema, security: [{ bearerAuth: [] }], tags: ['Games'] },
    },
    async (request, reply) => {
      const game = await gamesService.createGame({
        homeTeamId: request.body.homeTeamId,
        awayTeamId: request.body.awayTeamId,
        startsAt: new Date(request.body.startsAt),
        createdBy: request.user.sub,
      });
      reply.status(201);
      return game;
    },
  );

  app.patch(
    '/:id',
    {
      preHandler: [authenticate, requireRole('admin')],
      schema: {
        params: idParamsSchema,
        body: updateGameBodySchema,
        security: [{ bearerAuth: [] }],
        tags: ['Games'],
      },
    },
    async (request) => {
      const { startsAt, status } = request.body;
      return gamesService.updateGame(request.params.id, {
        ...(startsAt !== undefined ? { startsAt: new Date(startsAt) } : {}),
        ...(status !== undefined ? { status } : {}),
        updatedBy: request.user.sub,
      });
    },
  );

  app.patch(
    '/:id/capacity',
    {
      preHandler: [authenticate, requireRole('admin')],
      schema: {
        params: idParamsSchema,
        body: capacityBodySchema,
        security: [{ bearerAuth: [] }],
        tags: ['Games'],
      },
    },
    async (request) => {
      const seats = await gamesService.adjustCapacity(request.params.id, request.body);
      return { seats };
    },
  );

  app.get(
    '/:id/tickets',
    {
      preHandler: [authenticate, requireRole('admin')],
      schema: { params: idParamsSchema, security: [{ bearerAuth: [] }], tags: ['Games'] },
    },
    async (request) => {
      const tickets = await gamesService.listGameTickets(request.params.id);
      return { tickets };
    },
  );
};

export const teamsRouter: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { schema: { tags: ['Teams'] } }, async () => {
    const teams = await gamesService.listTeams();
    return { teams };
  });
};
