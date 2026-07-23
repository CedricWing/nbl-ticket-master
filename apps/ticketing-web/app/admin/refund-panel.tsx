'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError, getGameTickets, refundTicket, type GameTicket } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';
import { ticketsKey } from '@/lib/swr-keys';

export function RefundPanel({ gameId }: { gameId: string }) {
  const [open, setOpen] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);

  // One key per ticket, reused across retries of the same refund so a retry after a dropped
  // request resolves to the same attempt instead of risking a second one.
  const idempotencyKeys = useRef(new Map<string, string>());

  const {
    data: tickets,
    error: ticketsError,
    mutate,
  } = useSWR(open ? ticketsKey(gameId) : null, () => getGameTickets(gameId).then((res) => res.tickets));

  async function handleRefund(ticketId: string) {
    setRefundError(null);
    setRefunding(ticketId);
    let idempotencyKey = idempotencyKeys.current.get(ticketId);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      idempotencyKeys.current.set(ticketId, idempotencyKey);
    }
    try {
      await refundTicket(ticketId, idempotencyKey);
      idempotencyKeys.current.delete(ticketId);
      await mutate(
        (prev) => prev?.map((t) => (t.id === ticketId ? { ...t, status: 'refunded' as const } : t)),
        { revalidate: false },
      );
    } catch (err) {
      setRefundError(err instanceof ApiError ? err.message : 'Failed to refund ticket');
    } finally {
      setRefunding(null);
    }
  }

  return (
    <div className="border-t pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold">Tickets</p>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Show tickets
          </Button>
        )}
      </div>

      {open && ticketsError && (
        <p role="alert" className="text-destructive text-xs">
          {ticketsError instanceof ApiError ? ticketsError.message : 'Failed to load tickets'}
        </p>
      )}
      {open && tickets === undefined && !ticketsError && (
        <p className="text-muted-foreground text-xs">Loading…</p>
      )}
      {open && tickets && tickets.length === 0 && (
        <p className="text-muted-foreground text-xs">No tickets booked for this game.</p>
      )}
      {tickets?.map((ticket: GameTicket) => (
        <div key={ticket.id} className="flex items-center justify-between gap-2 py-1 text-xs">
          <span>
            Section {ticket.seat.section}, Row {ticket.seat.row}, Seat {ticket.seat.seatNumber} ·{' '}
            {ticket.user.name} ({ticket.user.email}) · {formatMoney(ticket.priceCents)}{' '}
            <Badge variant={ticket.status === 'confirmed' ? 'default' : 'secondary'}>
              {ticket.status}
            </Badge>
          </span>
          {ticket.status === 'confirmed' && (
            <Button
              size="sm"
              variant="destructive"
              disabled={refunding === ticket.id}
              onClick={() => handleRefund(ticket.id)}
            >
              {refunding === ticket.id ? 'Refunding…' : 'Refund'}
            </Button>
          )}
        </div>
      ))}
      {refundError && (
        <p role="alert" className="text-destructive mt-1 text-xs">
          {refundError}
        </p>
      )}
    </div>
  );
}
