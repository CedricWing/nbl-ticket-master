// This module's public API — every cross-module import of `games` must come through here,
// not by reaching into schema.ts/service.ts/repository.ts directly (enforced by the
// no-restricted-imports rule in eslint.config.js).
export {
  gameStatusEnum,
  games,
  seasonSeatAssignments,
  seatStatusEnum,
  seats,
  seatTemplates,
  teams,
} from './schema.js';
