import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { authRouter } from './modules/auth/router.js';
import { gamesRouter, teamsRouter } from './modules/games/router.js';
import { meRouter } from './modules/me/router.js';
import { ticketsRouter } from './modules/tickets/router.js';
import { errorHandler } from './shared/middleware/error-handler.js';

export function buildApp() {
  try {
    process.loadEnvFile();
  } catch {
    // no .env file — env vars provided by the environment (Docker/CI)
  }

  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  // @fastify/cors defaults to methods: 'GET,HEAD,POST' when not set explicitly — without this,
  // every PATCH request (editing a game, adjusting capacity) fails preflight in a real browser,
  // even though curl-based testing never surfaces it since curl doesn't enforce CORS at all.
  app.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3001',
    methods: ['GET', 'POST', 'PATCH'],
  });
  app.register(fastifyJwt, { secret: process.env.JWT_SECRET! });

  app.register(fastifySwagger, {
    openapi: {
      info: { title: 'NBL Ticket Master API', version: '0.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      tags: [
        { name: 'Auth' },
        { name: 'Games' },
        { name: 'Teams' },
        { name: 'Tickets' },
        { name: 'Me' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  app.register(fastifySwaggerUi, { routePrefix: '/docs' });

  app.register(authRouter, { prefix: '/auth' });
  app.register(gamesRouter, { prefix: '/games' });
  app.register(teamsRouter, { prefix: '/teams' });
  app.register(ticketsRouter, { prefix: '/tickets' });
  app.register(meRouter, { prefix: '/me' });

  return app;
}
