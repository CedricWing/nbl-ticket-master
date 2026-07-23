import * as authSchema from '../../modules/auth/schema.js';
import * as gamesSchema from '../../modules/games/schema.js';
import * as ticketsSchema from '../../modules/tickets/schema.js';

export * from '../../modules/auth/schema.js';
export * from '../../modules/games/schema.js';
export * from '../../modules/tickets/schema.js';

// Combined table map handed to drizzle() so `db.query.<table>` is available for every module.
export const schema = {
  ...authSchema,
  ...gamesSchema,
  ...ticketsSchema,
};
