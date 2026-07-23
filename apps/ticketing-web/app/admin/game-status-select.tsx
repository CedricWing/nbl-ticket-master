'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError, updateGame, type GameSummary } from '@/lib/api-client';
import { GAMES_KEY } from '@/lib/swr-keys';

const STATUS_LABELS: Record<GameSummary['status'], string> = {
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Mirrors the transition rules enforced in games/service.ts: upcoming can move to either
// terminal state, but completed/cancelled can't move anywhere once set.
const SELECTABLE_STATUSES: Record<GameSummary['status'], GameSummary['status'][]> = {
  upcoming: ['upcoming', 'completed', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
};

export function GameStatusSelect({ game }: { game: GameSummary }) {
  const { mutate } = useSWRConfig();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(status: GameSummary['status']) {
    setSaving(true);
    setError(null);
    try {
      await updateGame(game.id, { status });
      await mutate(GAMES_KEY);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  }

  const selectableStatuses = SELECTABLE_STATUSES[game.status];
  const isTerminal = selectableStatuses.length === 1;

  return (
    <div>
      <Select
        value={game.status}
        onValueChange={(v) => handleChange(v as GameSummary['status'])}
        disabled={saving || isTerminal}
      >
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {selectableStatuses.map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p role="alert" className="text-destructive mt-1 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
