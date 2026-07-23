'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SEAT_COLORS, SeatButton, sectionDotVariants } from '@/components/seat-button';
import { ApiError, bookTicket, getGame, getMyTickets, type GameDetail, type Seat } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatMoney, formatStartsAt } from '@/lib/format';
import { GAME_STATUS_VARIANT } from '@/lib/status';
import { MY_TICKETS_KEY } from '@/lib/swr-keys';

export function GameDetailClient({
  gameId,
  initialGame,
}: {
  gameId: string;
  initialGame: GameDetail;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const isLoggedIn = user !== null;

  const { data: game, mutate } = useSWR(['game', gameId], () => getGame(gameId), {
    fallbackData: initialGame,
  });

  const { data: myTickets } = useSWR(isLoggedIn ? MY_TICKETS_KEY : null, () =>
    getMyTickets().then((res) => res.tickets),
  );
  const mySeatIds = useMemo(() => {
    const confirmedInThisGame = myTickets?.filter(
      (ticket) => ticket.status === 'confirmed' && ticket.game.id === gameId,
    );
    return new Set(confirmedInThisGame?.map((ticket) => ticket.seat.id));
  }, [myTickets, gameId]);

  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const sections = useMemo(() => {
    if (!game) return [];
    const bySection = new Map<string, Seat[]>();
    for (const seat of game.seats) {
      bySection.set(seat.section, [...(bySection.get(seat.section) ?? []), seat]);
    }
    return [...bySection.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [game]);

  const legend = useMemo(() => {
    return sections.map(([section, seats], i) => ({
      section,
      priceCents: seats[0]!.priceCents,
      color: SEAT_COLORS[i % SEAT_COLORS.length]!,
    }));
  }, [sections]);

  // Date.now() can't be read directly during render (the React Compiler requires renders to be
  // pure), so the current time lives in state instead, refreshed periodically.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const gameHasStarted =
    game !== undefined && now !== undefined && new Date(game.startsAt).getTime() <= now;

  function openSeat(seat: Seat) {
    if (seat.status !== 'available' || gameHasStarted) return;
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    setBookingError(null);
    setIdempotencyKey(crypto.randomUUID());
    setSelectedSeat(seat);
  }

  async function confirmBooking() {
    if (!selectedSeat || !idempotencyKey) return;
    setBooking(true);
    setBookingError(null);
    try {
      await bookTicket(selectedSeat.id, idempotencyKey);
      setSelectedSeat(null);
      await mutate();
    } catch (err) {
      setBookingError(err instanceof ApiError ? err.message : 'Failed to book this seat');
    } finally {
      setBooking(false);
    }
  }

  function formatSeatLabel(seat: Seat) {
    return `Section ${seat.section}, Row ${seat.row}, Seat ${seat.seatNumber} — ${formatMoney(seat.priceCents)}`;
  }

  if (!game) return null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="bg-nbl-orange-600 mb-6 rounded-lg p-6 text-white">
        <div className="mb-2 flex items-center justify-between">
          <Badge variant={GAME_STATUS_VARIANT[game.status]}>{game.status}</Badge>
        </div>
        <h1 className="text-2xl font-bold">
          {game.awayTeam.name} @ {game.homeTeam.name}
        </h1>
        <p className="mt-1 text-sm opacity-90">
          {formatStartsAt(game.startsAt)} · {game.homeTeam.homeVenue}
        </p>
      </div>

      {gameHasStarted ? (
        <p className="text-muted-foreground mb-4 text-sm">This game has already started — booking is closed.</p>
      ) : (
        !isLoggedIn && (
          <p className="text-muted-foreground mb-4 text-sm">
            <a href="/login" className="text-nbl-orange-600 font-medium underline">
              Log in
            </a>{' '}
            to book a seat.
          </p>
        )
      )}

      <div className="mb-4 flex flex-wrap gap-4">
        {legend.map(({ section, priceCents, color }) => (
          <div key={section} className="flex items-center gap-2 text-sm">
            <span className={sectionDotVariants({ color })} />
            Section {section} · {formatMoney(priceCents)}
          </div>
        ))}
        <div className="flex items-center gap-2 text-sm">
          <span className="bg-muted size-3 rounded-full" />
          Booked
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="bg-secondary size-3 rounded-full" />
          Season holder
        </div>
        {isLoggedIn && (
          <div className="flex items-center gap-2 text-sm">
            <span className="ring-2 ring-yellow-500 ring-offset-1 size-3 rounded-full" />
            Your seat
          </div>
        )}
      </div>

      <div className="grid gap-4">
        {sections.map(([section, seats], i) => {
          const color = SEAT_COLORS[i % SEAT_COLORS.length]!;
          const byRow = new Map<string, Seat[]>();
          for (const seat of seats) {
            byRow.set(seat.row, [...(byRow.get(seat.row) ?? []), seat]);
          }
          const rows = [...byRow.entries()].sort(([a], [b]) => a.localeCompare(b));

          return (
            <Card key={section}>
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-semibold">Section {section}</h2>
                <div className="grid gap-2">
                  {rows.map(([row, rowSeats]) => (
                    <div key={row} className="flex items-center gap-2">
                      <span className="text-muted-foreground w-6 text-xs">{row}</span>
                      <div className="flex flex-wrap gap-1">
                        {[...rowSeats]
                          .sort((a, b) => a.seatNumber - b.seatNumber)
                          .map((seat) => (
                            <SeatButton
                              key={seat.id}
                              seat={seat}
                              color={color}
                              isMine={mySeatIds.has(seat.id)}
                              disabled={gameHasStarted}
                              onSelect={openSeat}
                              formatLabel={formatSeatLabel}
                            />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={selectedSeat !== null} onOpenChange={(open) => !open && setSelectedSeat(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm booking</DialogTitle>
            <DialogDescription>
              {selectedSeat && (
                <>
                  Section {selectedSeat.section}, Row {selectedSeat.row}, Seat{' '}
                  {selectedSeat.seatNumber} — {formatMoney(selectedSeat.priceCents)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {bookingError && (
            <p role="alert" className="text-destructive text-sm">
              {bookingError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedSeat(null)} disabled={booking}>
              Cancel
            </Button>
            <Button onClick={confirmBooking} disabled={booking}>
              {booking ? 'Booking…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
