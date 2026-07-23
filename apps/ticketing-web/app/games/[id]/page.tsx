import { ApiError, getGame } from '@/lib/api-client';
import { GameDetailClient } from './game-detail-client';

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let game;
  let errorMessage: string | null = null;
  try {
    game = await getGame(id);
  } catch (err) {
    errorMessage = err instanceof ApiError ? err.message : 'Failed to load game';
  }

  if (!game) {
    return (
      <p role="alert" className="text-destructive p-6 text-sm">
        {errorMessage}
      </p>
    );
  }

  // Keyed by id so navigating between two games' detail pages remounts the client
  // component fresh instead of carrying over the previous game's state.
  return <GameDetailClient key={id} gameId={id} initialGame={game} />;
}
