import '@fastify/jwt';

export type Role = 'member' | 'admin';

export interface AuthPayload {
  sub: string;
  role: Role;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthPayload;
    user: AuthPayload;
  }
}
