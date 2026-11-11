import type { components } from '@/shared/api/schema';

type Booking = components['schemas']['Booking_Output'];

/**
 * Words for the status, from the viewer's side. Presentation only: what the booking is and
 * what can be done with it comes from the API (status, allowedActions).
 */
export function statusLabel(b: Pick<Booking, 'status' | 'party' | 'cancelledBy'>): string {
  const mine = b.party === 'client';
  switch (b.status) {
    case 'pending':
      return mine ? 'Ждёт подтверждения' : 'Ждёт вашего ответа';
    case 'confirmed':
      return 'Подтверждена';
    case 'rejected':
      return mine ? 'Отклонена специалистом' : 'Вы отклонили';
    case 'cancelled':
      if (b.cancelledBy === b.party) return 'Вы отменили';
      return mine ? 'Отменена специалистом' : 'Отменена клиентом';
    case 'expired':
      return 'Истекла без ответа';
  }
}

export const ACTION_LABELS = {
  confirm: 'Подтвердить',
  reject: 'Отклонить',
  cancel: 'Отменить',
} as const;
