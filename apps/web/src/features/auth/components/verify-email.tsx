'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/shared/api/client';
import { problemMessage } from '@/shared/api/errors';
import { useFragmentToken } from '@/shared/lib/use-fragment-token';
import { FormAlert, Notice } from '@/shared/ui/form';

type State = { status: 'checking' } | { status: 'done' } | { status: 'error'; message: string };

/**
 * GET of this page changes nothing — mail scanners that open links cannot use up the
 * token (ADR-008). Confirmation is a POST sent by the page's script.
 */
export function VerifyEmail() {
  const token = useFragmentToken();
  const [state, setState] = useState<State>({ status: 'checking' });
  // React Strict Mode runs effects twice in development; a second POST would see a used token
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api
      .POST('/auth/verify-email', { body: { token } })
      .then(({ error }) =>
        setState(error ? { status: 'error', message: problemMessage(error) } : { status: 'done' }),
      )
      .catch((cause: unknown) => setState({ status: 'error', message: problemMessage(cause) }));
  }, [token]);

  const failure =
    token === null
      ? 'В ссылке нет кода подтверждения.'
      : state.status === 'error'
        ? state.message
        : null;

  if (failure) {
    return (
      <div className="flex flex-col gap-3">
        <FormAlert>{failure}</FormAlert>
        <p className="text-sm text-slate-600">
          Новую ссылку можно отправить из{' '}
          <Link href="/bookings" className="font-medium text-slate-900 underline">
            личного кабинета
          </Link>
          .
        </p>
      </div>
    );
  }
  if (state.status === 'checking') return <p className="text-slate-600">Проверяем ссылку…</p>;
  return (
    <div className="flex flex-col gap-3">
      <Notice>Email подтверждён.</Notice>
      <Link href="/bookings" className="font-medium text-slate-900 underline">
        Перейти в личный кабинет
      </Link>
    </div>
  );
}
