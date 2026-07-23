import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { login } from './service.js';

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter: FastifyPluginAsyncZod = async (app) => {
  app.post('/login', { schema: { body: loginBodySchema, tags: ['Auth'] } }, async (request, reply) => {
    const user = await login(request.body);
    const token = await reply.jwtSign({ sub: user.id, role: user.role });

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  });
};
