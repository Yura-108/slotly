import type { Metadata } from 'next';
import { RegisterForm } from '@/features/auth/components/register-form';

export const metadata: Metadata = { title: 'Регистрация — Slotly' };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Регистрация</h1>
      <RegisterForm />
    </>
  );
}
