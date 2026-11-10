import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';

// No Referer leaves this page: a defence in depth for the token in the URL (ADR-008)
export const metadata: Metadata = { title: 'Новый пароль — Slotly', referrer: 'no-referrer' };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Новый пароль</h1>
      <ResetPasswordForm />
    </>
  );
}
