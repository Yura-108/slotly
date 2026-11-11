'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/shared/api/client';
import { hasCode, problemMessage } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';
import { formatMoment, formatTimeRange } from '@/shared/lib/time';
import { Button, FormAlert } from '@/shared/ui/form';
import { ACTION_LABELS, statusLabel } from '../lib/labels';

type Booking = components['schemas']['Booking_Output'];
type Action = Booking['allowedActions'][number];

/**
 * One booking with the actions the API allows the viewer now (ADR-009). Times are shown
 * in the viewer's profile zone, passed explicitly, so server and browser render the same.
 */
export function BookingCard({ booking, timeZone }: { booking: Booking; timeZone: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState<'reject' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    setBusy(true);
    setError(null);
    try {
      const path = { params: { path: { id: booking.id } } };
      const { error: problem } =
        action === 'confirm'
          ? await api.POST('/bookings/{id}/confirm', path)
          : await api.POST(
              action === 'reject' ? '/bookings/{id}/reject' : '/bookings/{id}/cancel',
              {
                ...path,
                body: { reason },
              },
            );
      if (problem) {
        setError(problemMessage(problem));
        // Someone (another tab, the other party, the clock) changed it: show the fresh state
        if (hasCode(problem, 'BOOKING_STATUS_CHANGED', 'CANCEL_DEADLINE_PASSED')) {
          router.refresh();
        }
        return;
      }
      setAsking(null);
      router.refresh();
    } catch (cause) {
      setError(problemMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const other =
    booking.party === 'client' ? (
      <Link href={`/book/${booking.specialist.slug}`} className="underline">
        {booking.specialist.displayName}
      </Link>
    ) : (
      booking.client.name
    );

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium first-letter:uppercase">
          {formatTimeRange(booking.startAt, booking.endAt, timeZone)}
        </p>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-sm text-slate-700">
          {statusLabel(booking)}
        </span>
      </div>
      <p className="text-slate-700">
        {booking.serviceName} · {other}
      </p>

      {booking.status === 'pending' && booking.expiresAt && (
        <p className="text-sm text-slate-600">
          {booking.party === 'specialist' ? 'Ответьте до ' : 'Специалист ответит до '}
          {formatMoment(booking.expiresAt, timeZone)}
        </p>
      )}
      {booking.status === 'confirmed' && booking.party === 'client' && (
        <p className="text-sm text-slate-600">
          {booking.allowedActions.includes('cancel')
            ? `Отменить самостоятельно можно до ${formatMoment(booking.cancelDeadlineAt, timeZone)}`
            : `Самостоятельная отмена была возможна до ${formatMoment(booking.cancelDeadlineAt, timeZone)}`}
        </p>
      )}
      {booking.statusReason && (
        <p className="text-sm text-slate-600">Причина: {booking.statusReason}</p>
      )}

      {error && <FormAlert>{error}</FormAlert>}

      {asking ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`reason-${booking.id}`} className="text-sm font-medium text-slate-700">
            Причина (необязательно) — её увидит{' '}
            {booking.party === 'client' ? 'специалист' : 'клиент'}
          </label>
          <textarea
            id={`reason-${booking.id}`}
            maxLength={500}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void run(asking)}>
              {asking === 'reject' ? 'Отклонить заявку' : 'Отменить запись'}
            </Button>
            <button
              type="button"
              className="text-sm text-slate-600 underline"
              onClick={() => setAsking(null)}
            >
              Назад
            </button>
          </div>
        </div>
      ) : (
        booking.allowedActions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {booking.allowedActions.map((action) =>
              action === 'confirm' ? (
                <Button key={action} type="button" disabled={busy} onClick={() => void run(action)}>
                  {ACTION_LABELS.confirm}
                </Button>
              ) : (
                <button
                  key={action}
                  type="button"
                  disabled={busy}
                  onClick={() => setAsking(action)}
                  className="rounded-md border border-slate-300 px-4 py-2 font-medium hover:border-slate-900"
                >
                  {ACTION_LABELS[action]}
                </button>
              ),
            )}
          </div>
        )
      )}
    </li>
  );
}
