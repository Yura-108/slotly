'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/shared/api/client';
import { hasCode, problemMessage, SLOT_GONE_CODES } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';
import { Button, FormAlert } from '@/shared/ui/form';
import type { Slot } from '../lib/slot-grid';

export type CreatedBooking = components['schemas']['Booking_Output'];

/** Who is looking at the page; null — not signed in. */
export type Viewer = { emailVerified: boolean } | null;

/**
 * Confirmation of the chosen slot. The API decides everything (frontend.md §4): the panel
 * only explains the states it cannot change — not signed in, email not confirmed.
 */
export function BookingConfirm({
  slug,
  serviceId,
  slot,
  label,
  viewer,
  onBooked,
  onSlotGone,
}: {
  slug: string;
  serviceId: string;
  slot: Slot;
  label: string;
  viewer: Viewer;
  onBooked: (booking: CreatedBooking) => void;
  onSlotGone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const booking = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/bookings', {
        body: { serviceId, startAt: slot.start },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (created) => onBooked(created),
    onError: (error) => {
      // The panel closes with the slot, so the picker shows the message
      if (hasCode(error, ...SLOT_GONE_CODES)) onSlotGone(problemMessage(error));
    },
    // Free time has changed either way: ours is taken, or someone else's was
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots', slug] }),
  });

  if (!viewer) {
    return (
      <Panel label={label}>
        <p className="text-slate-700">
          <Link
            href={`/login?next=${encodeURIComponent(`/book/${slug}`)}`}
            className="font-medium text-slate-900 underline"
          >
            Войдите
          </Link>{' '}
          или{' '}
          <Link href="/register" className="font-medium text-slate-900 underline">
            зарегистрируйтесь
          </Link>
          , чтобы записаться.
        </p>
      </Panel>
    );
  }

  if (!viewer.emailVerified) {
    return (
      <Panel label={label}>
        <p className="text-slate-700">
          Подтвердите email — ссылка в письме после регистрации. Без этого записаться нельзя: о
          подтверждении и изменениях записи мы сообщаем письмом.
        </p>
      </Panel>
    );
  }

  return (
    <Panel label={label}>
      {booking.isError && <FormAlert>{problemMessage(booking.error)}</FormAlert>}
      <div>
        {/* Disabled while sending: a double click must not send two requests (api.md §6) */}
        <Button type="button" disabled={booking.isPending} onClick={() => booking.mutate()}>
          {booking.isPending ? 'Записываем…' : 'Записаться'}
        </Button>
      </div>
    </Panel>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-900 p-4" aria-live="polite">
      <p className="font-medium first-letter:uppercase">{label}</p>
      {children}
    </div>
  );
}
