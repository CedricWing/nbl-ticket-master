import type { GameSummary, MyTicket } from '@/lib/api-client';

export const GAME_STATUS_VARIANT: Record<GameSummary['status'], 'default' | 'secondary' | 'outline'> = {
  upcoming: 'default',
  completed: 'secondary',
  cancelled: 'outline',
};

export const TICKET_STATUS_VARIANT: Record<MyTicket['status'], 'default' | 'secondary'> = {
  confirmed: 'default',
  refunded: 'secondary',
};
