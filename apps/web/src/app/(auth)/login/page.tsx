import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/components/login-form';
import { Notice } from '@/shared/ui/form';

export const metadata: Metadata = { title: 'Вход — Slotly' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next, registered } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold">Вход</h1>
      {registered === '1' && (
        // Same text for a new and an existing email: the page must not reveal which (ADR-005)
        <Notice>Аккаунт создан или уже существует. Войдите с вашим email и паролем.</Notice>
      )}
      <LoginForm next={typeof next === 'string' ? next : undefined} />
    </>
  );
}
