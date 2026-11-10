'use client';

import { useState } from 'react';
import { api } from '@/shared/api/client';
import { problemMessage } from '@/shared/api/errors';

/** FR-2: without a confirmed email the user cannot book; this banner explains and offers a new link. */
export function ResendVerificationBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setState('sending');
    setError(null);
    try {
      const { error: problem } = await api.POST('/auth/verify-email/resend');
      if (problem) {
        setError(problemMessage(problem));
        setState('idle');
        return;
      }
      setState('sent');
    } catch (cause) {
      setError(problemMessage(cause));
      setState('idle');
    }
  }

  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm text-amber-900">
        <span>
          Подтвердите email: мы отправили письмо на <strong>{email}</strong>. Без подтверждения
          нельзя записываться к специалистам.
        </span>
        {state === 'sent' ? (
          <span>Письмо отправлено ещё раз.</span>
        ) : (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={state === 'sending'}
            className="font-medium underline disabled:opacity-60"
          >
            Отправить ещё раз
          </button>
        )}
        {error && <span className="text-red-700">{error}</span>}
      </div>
    </div>
  );
}
