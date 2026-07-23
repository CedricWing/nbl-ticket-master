'use client';

import useSWR from 'swr';

import { ApiError, getGames, getTeams } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { GAMES_KEY, TEAMS_KEY } from '@/lib/swr-keys';
import { CreateGameForm } from './create-game-form';
import { GameAdminRow } from './game-admin-row';

export default function AdminPage() {
  const { user, initialized } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data: teams, error: teamsError } = useSWR(isAdmin ? TEAMS_KEY : null, () =>
    getTeams().then((res) => res.teams),
  );
  const {
    data: games,
    error: gamesError,
    mutate: refetchGames,
  } = useSWR(isAdmin ? GAMES_KEY : null, () => getGames().then((res) => res.games));

  if (!initialized) return null;

  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 p-6">
        <p className="text-muted-foreground text-sm">
          You need an admin account to view this page.{' '}
          <a href="/login" className="text-nbl-orange-600 underline">
            Log in
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <CreateGameForm
        teams={teams ?? []}
        teamsError={teamsError !== undefined}
        onCreated={() => refetchGames()}
      />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Games</h2>
        {gamesError && (
          <p role="alert" className="text-destructive text-sm">
            {gamesError instanceof ApiError ? gamesError.message : 'Failed to load games'}
          </p>
        )}
        {games === undefined && !gamesError && (
          <p className="text-muted-foreground text-sm">Loading…</p>
        )}
        {games?.map((game) => (
          <GameAdminRow key={game.id} game={game} />
        ))}
      </div>
    </div>
  );
}
