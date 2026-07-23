import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ApiError, getGames, type GameSummary, type Team } from '@/lib/api-client';
import { formatDateLine, formatTimeLine } from '@/lib/format';
import { GAME_STATUS_VARIANT } from '@/lib/status';

// Game list changes on every booking/status update — force per-request rendering instead of
// letting Next statically cache the response from whatever data happened to exist at build time.
export const dynamic = 'force-dynamic';

function initials(name: string) {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 3);
}

function TeamBadge({ team }: { team: Team }) {
  return (
    <div className="bg-nbl-orange-500 flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
      {initials(team.name)}
    </div>
  );
}

export default async function HomePage() {
  let games: GameSummary[] = [];
  let error: string | null = null;
  try {
    const res = await getGames();
    games = res.games;
  } catch (err) {
    error = err instanceof ApiError ? err.message : 'Failed to load games';
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-6">
      <h1 className="mb-6 text-2xl font-semibold">Upcoming Games</h1>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {!error && games.length === 0 && (
        <p className="text-muted-foreground text-sm">No games scheduled yet.</p>
      )}

      <div className="grid gap-4">
        {games.map((game) => (
          <Link key={game.id} href={`/games/${game.id}`}>
            <Card className="hover:border-nbl-orange-500 transition-colors">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex flex-1 items-center gap-3">
                  <TeamBadge team={game.awayTeam} />
                  <span className="text-sm font-bold">{game.awayTeam.name}</span>
                </div>

                <div className="flex shrink-0 flex-col items-center gap-1 px-2 text-center">
                  <Badge variant={GAME_STATUS_VARIANT[game.status]}>{game.status}</Badge>
                  <span className="text-sm font-bold">{formatDateLine(game.startsAt)}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatTimeLine(game.startsAt)} · {game.homeTeam.homeVenue}
                  </span>
                </div>

                <div className="flex flex-1 items-center justify-end gap-3">
                  <span className="text-sm font-bold">{game.homeTeam.name}</span>
                  <TeamBadge team={game.homeTeam} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
