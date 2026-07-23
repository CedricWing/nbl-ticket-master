'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, updateGame, type GameSummary } from '@/lib/api-client';
import { GAMES_KEY } from '@/lib/swr-keys';

// <input type="datetime-local"> takes/returns "YYYY-MM-DDTHH:mm" in the browser's local time,
// with no timezone suffix — this converts the game's ISO startsAt into that shape.
function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function GameScheduleForm({ game }: { game: GameSummary }) {
  const { mutate } = useSWRConfig();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => toDatetimeLocalValue(game.startsAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (game.status !== 'upcoming') return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateGame(game.id, { startsAt: new Date(value).toISOString() });
      await mutate(GAMES_KEY);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reschedule game');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setValue(toDatetimeLocalValue(game.startsAt));
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        Reschedule
      </Button>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-auto"
        />
        <Button size="sm" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="outline" disabled={saving} onClick={handleCancel}>
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive mt-1 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
