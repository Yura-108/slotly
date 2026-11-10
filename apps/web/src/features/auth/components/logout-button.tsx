'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/shared/api/client';
import { problemMessage } from '@/shared/api/errors';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setPending(true);
    setError(null);
    try {
      const { error: problem } = await api.POST('/auth/logout');
      if (problem) {
        setError(problemMessage(problem));
        return;
      }
      router.replace('/login');
      router.refresh();
    } catch (cause) {
      setError(problemMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-sm text-red-700">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={() => void logout()}
        disabled={pending}
        className="text-sm font-medium text-slate-700 underline hover:text-slate-900 disabled:opacity-60"
      >
        Выйти
      </button>
    </div>
  );
}
