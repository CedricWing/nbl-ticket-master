'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, adjustCapacity, getGame, type GameSummary } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';

interface SeatRow {
  section: string;
  row: string;
  priceCents: number;
  count: number;
}

export function CapacityForm({
  gameId,
  gameStatus,
}: {
  gameId: string;
  gameStatus: GameSummary['status'];
}) {
  const canAdjust = gameStatus === 'upcoming';
  const [open, setOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const {
    data: game,
    error: gameError,
    mutate,
  } = useSWR(open ? ['game', gameId] : null, () => getGame(gameId));

  const seatRows = useMemo<SeatRow[]>(() => {
    if (!game) return [];
    const grouped = new Map<string, SeatRow>();
    for (const seat of game.seats) {
      const key = `${seat.section}::${seat.row}`;
      const existing = grouped.get(key);
      if (existing) existing.count += 1;
      else grouped.set(key, { section: seat.section, row: seat.row, priceCents: seat.priceCents, count: 1 });
    }
    return [...grouped.values()].sort(
      (a, b) => a.section.localeCompare(b.section) || a.row.localeCompare(b.row),
    );
  }, [game]);

  async function adjustRow(seatRow: SeatRow, delta: number) {
    const key = `${seatRow.section}::${seatRow.row}`;
    setRowError(null);
    setBusyRow(key);
    try {
      await adjustCapacity(gameId, {
        section: seatRow.section,
        row: seatRow.row,
        delta,
        ...(delta > 0 ? { priceCents: seatRow.priceCents } : {}),
      });
      await mutate();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to adjust capacity');
    } finally {
      setBusyRow(null);
    }
  }

  return (
    <div className="border-t pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold">Capacity</p>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Manage capacity
          </Button>
        )}
      </div>

      {open && gameError && (
        <p role="alert" className="text-destructive text-xs">
          Failed to load current capacity
        </p>
      )}
      {open && game === undefined && !gameError && (
        <p className="text-muted-foreground text-xs">Loading…</p>
      )}

      {open && !canAdjust && (
        <p className="text-muted-foreground mb-2 text-xs">
          Capacity can only be adjusted for upcoming games.
        </p>
      )}

      {open && seatRows.length > 0 && (
        <div className="mb-3 space-y-1">
          {seatRows.map((seatRow) => {
            const key = `${seatRow.section}::${seatRow.row}`;
            return (
              <div key={key} className="flex items-center justify-between gap-2 text-xs">
                <span>
                  Section {seatRow.section}, Row {seatRow.row} · {seatRow.count} seat
                  {seatRow.count === 1 ? '' : 's'} · {formatMoney(seatRow.priceCents)}
                </span>
                {canAdjust && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0"
                      disabled={busyRow === key}
                      onClick={() => adjustRow(seatRow, -1)}
                    >
                      −
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0"
                      disabled={busyRow === key}
                      onClick={() => adjustRow(seatRow, 1)}
                    >
                      +
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {open && canAdjust && <AddRowForm gameId={gameId} onAdded={() => mutate()} />}

      {rowError && (
        <p role="alert" className="text-destructive mt-1 text-xs">
          {rowError}
        </p>
      )}
    </div>
  );
}

function AddRowForm({ gameId, onAdded }: { gameId: string; onAdded: () => void }) {
  const [section, setSection] = useState('');
  const [row, setRow] = useState('');
  const [count, setCount] = useState('');
  const [priceCents, setPriceCents] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    const countNum = Number(count);
    const priceNum = Number(priceCents);
    if (!section || !row || !Number.isInteger(countNum) || countNum <= 0 || !priceCents) {
      setError('Section, row, a positive seat count, and a price are required');
      return;
    }
    setSaving(true);
    try {
      await adjustCapacity(gameId, { section, row, delta: countNum, priceCents: priceNum });
      setSection('');
      setRow('');
      setCount('');
      setPriceCents('');
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add row');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t pt-2">
      <p className="text-muted-foreground mb-2 text-xs">Add a new section/row</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="capacity-section">Section</Label>
          <Input
            id="capacity-section"
            placeholder="e.g. C"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="capacity-row">Row</Label>
          <Input
            id="capacity-row"
            placeholder="e.g. 1"
            value={row}
            onChange={(e) => setRow(e.target.value)}
            className="w-20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="capacity-count">Seat count</Label>
          <Input
            id="capacity-count"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="capacity-price">Price (cents)</Label>
          <Input
            id="capacity-price"
            value={priceCents}
            onChange={(e) => setPriceCents(e.target.value)}
            className="w-28"
          />
        </div>
        <Button size="sm" onClick={handleAdd} disabled={saving}>
          {saving ? 'Adding…' : 'Add'}
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
