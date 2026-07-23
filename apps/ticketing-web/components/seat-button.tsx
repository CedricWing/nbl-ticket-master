import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import type { Seat } from '@/lib/api-client';

// Cycled by section index — ties each section's price-legend dot to its seats in the grid.
export const SEAT_COLORS = ['blue', 'orange', 'emerald', 'violet'] as const;
export type SeatColor = (typeof SEAT_COLORS)[number];

export const sectionDotVariants = cva('size-3 rounded-full', {
  variants: {
    color: {
      blue: 'bg-blue-500',
      orange: 'bg-nbl-orange-500',
      emerald: 'bg-emerald-500',
      violet: 'bg-violet-500',
    },
  },
  defaultVariants: { color: 'blue' },
});

const seatButtonVariants = cva(
  'flex size-8 items-center justify-center rounded border text-xs font-medium transition-colors disabled:cursor-not-allowed',
  {
    variants: {
      color: {
        blue: '',
        orange: '',
        emerald: '',
        violet: '',
      },
      status: {
        available: '',
        booked: 'bg-muted text-muted-foreground border-transparent',
        reserved_season: 'bg-secondary text-secondary-foreground border-transparent',
      },
    },
    compoundVariants: [
      { color: 'blue', status: 'available', className: 'border-blue-300 bg-blue-100 text-blue-900 hover:bg-blue-200' },
      {
        color: 'orange',
        status: 'available',
        className: 'border-nbl-orange-300 bg-nbl-orange-100 text-nbl-orange-900 hover:bg-nbl-orange-200',
      },
      {
        color: 'emerald',
        status: 'available',
        className: 'border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-200',
      },
      {
        color: 'violet',
        status: 'available',
        className: 'border-violet-300 bg-violet-100 text-violet-900 hover:bg-violet-200',
      },
    ],
    defaultVariants: { color: 'blue', status: 'available' },
  },
);

interface SeatButtonProps extends VariantProps<typeof seatButtonVariants> {
  seat: Seat;
  // Highlights a seat the current user holds a confirmed ticket for — layered on top of the
  // section/status styling above rather than folded into it, since "mine" can coincide with
  // any status (booked, or reserved_season for a season holder's own seat).
  isMine?: boolean;
  // Extra condition beyond the seat's own status — e.g. the game has already started.
  disabled?: boolean;
  onSelect: (seat: Seat) => void;
  formatLabel: (seat: Seat) => string;
}

// Memoized so booking a single seat (which refetches the whole game) doesn't re-render every
// other seat button in the grid.
export const SeatButton = React.memo(function SeatButton({
  seat,
  color,
  isMine,
  disabled,
  onSelect,
  formatLabel,
}: SeatButtonProps) {
  return (
    <button
      type="button"
      disabled={seat.status !== 'available' || disabled}
      onClick={() => onSelect(seat)}
      title={formatLabel(seat)}
      className={cn(
        seatButtonVariants({ color, status: seat.status }),
        isMine && 'ring-2 ring-yellow-500 ring-offset-1',
      )}
    >
      {seat.seatNumber}
    </button>
  );
});
