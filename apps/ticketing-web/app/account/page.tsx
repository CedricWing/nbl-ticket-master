'use client';

import Link from 'next/link';
import useSWR from 'swr';

import { ProfileCard } from '@/components/profile-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ApiError, getMyTickets } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDateLine, formatMoney, formatTimeLine } from '@/lib/format';
import { MY_TICKETS_KEY } from '@/lib/swr-keys';
import { TICKET_STATUS_VARIANT } from '@/lib/status';

export default function AccountPage() {
  const { user, initialized } = useAuth();
  const { data: tickets, error } = useSWR(user ? MY_TICKETS_KEY : null, () =>
    getMyTickets().then((res) => res.tickets),
  );

  if (!initialized) return null;

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 p-6">
        <p className="text-muted-foreground text-sm">
          <a href="/login" className="text-nbl-orange-600 underline">
            Log in
          </a>{' '}
          to see your account.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-6">
      <h1 className="mb-6 text-2xl font-semibold">My Account</h1>

      <ProfileCard />

      <h2 className="mb-4 text-lg font-semibold">My Tickets</h2>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error instanceof ApiError ? error.message : 'Failed to load your tickets'}
        </p>
      )}
      {tickets === undefined && !error && <p className="text-muted-foreground text-sm">Loading…</p>}
      {tickets && tickets.length === 0 && (
        <p className="text-muted-foreground text-sm">
          You have not booked any tickets yet.{' '}
          <Link href="/" className="text-nbl-orange-600 underline">
            Browse games
          </Link>
          .
        </p>
      )}

      <div className="grid gap-4">
        {tickets?.map((ticket) => (
          <Link key={ticket.id} href={`/games/${ticket.game.id}`}>
            <Card className="hover:border-nbl-orange-500 transition-colors">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-semibold">
                    {ticket.game.awayTeam.name} @ {ticket.game.homeTeam.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDateLine(ticket.game.startsAt)} · {formatTimeLine(ticket.game.startsAt)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Section {ticket.seat.section}, Row {ticket.seat.row}, Seat{' '}
                    {ticket.seat.seatNumber}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={TICKET_STATUS_VARIANT[ticket.status]}>{ticket.status}</Badge>
                  <span className="text-sm font-bold">{formatMoney(ticket.priceCents)}</span>
                  {ticket.seat.status === 'reserved_season' && (
                    <span className="text-muted-foreground text-xs">Season pass</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
