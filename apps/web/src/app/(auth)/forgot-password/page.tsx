import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';

export const metadata: Metadata = { title: 'Восстановление пароля — Slotly' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Восстановление пароля</h1>
      <p className="text-slate-600">Пришлём ссылку для создания нового пароля.</p>
      <ForgotPasswordForm />
    </>
  );
}
