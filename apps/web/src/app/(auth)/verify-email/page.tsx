import type { Metadata } from 'next';
import { VerifyEmail } from '@/features/auth/components/verify-email';

// No Referer leaves this page: a defence in depth for the token in the URL (ADR-008)
export const metadata: Metadata = {
  title: 'Подтверждение email — Slotly',
  referrer: 'no-referrer',
};

export default function VerifyEmailPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Подтверждение email</h1>
      <VerifyEmail />
    </>
  );
}
