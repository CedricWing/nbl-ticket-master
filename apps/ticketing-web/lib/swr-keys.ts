// Shared SWR cache keys so mutating components can invalidate the right query without
// prop-drilling a refetch callback down through the tree.
export const GAMES_KEY = 'games';
export const TEAMS_KEY = 'teams';
export const MY_TICKETS_KEY = 'my-tickets';
export const ticketsKey = (gameId: string) => ['tickets', gameId] as const;
