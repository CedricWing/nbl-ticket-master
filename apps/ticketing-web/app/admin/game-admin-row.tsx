import { Card, CardContent } from '@/components/ui/card';
import type { GameSummary } from '@/lib/api-client';
import { CapacityForm } from './capacity-form';
import { GameScheduleForm } from './game-schedule-form';
import { GameStatusSelect } from './game-status-select';
import { RefundPanel } from './refund-panel';

export function GameAdminRow({ game }: { game: GameSummary }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">
              {game.awayTeam.name} @ {game.homeTeam.name}
            </p>
            <p className="text-muted-foreground text-xs">{new Date(game.startsAt).toLocaleString()}</p>
            <div className="mt-1">
              <GameScheduleForm game={game} />
            </div>
          </div>
          <GameStatusSelect game={game} />
        </div>
        <CapacityForm gameId={game.id} gameStatus={game.status} />
        <RefundPanel gameId={game.id} />
      </CardContent>
    </Card>
  );
}
