import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authenticate } from '../auth/index.js';
import { db } from '../../shared/database/client.js';
import * as repo from './repository.js';

// A single read with no business logic to speak of, so this skips the service layer the other
// modules have — router calls the repository directly.
export const meRouter: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/season-status',
    { preHandler: [authenticate], schema: { security: [{ bearerAuth: [] }], tags: ['Me'] } },
    async (request) => {
      const teamNames = await repo.findSeasonHolderTeamNames(db, request.user.sub);
      return { isSeasonHolder: teamNames.length > 0, teams: teamNames };
    },
  );
};
