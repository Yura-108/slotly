import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/features/auth/components/login-form';
import { Notice } from '@/shared/ui/form';

export const metadata: Metadata = { title: 'Вход — Slotly' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next, registered, reset } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold">Вход</h1>
      {registered === '1' && (
        // Same text for a new and an existing email: the page must not reveal which (ADR-005)
        <Notice>
          Мы отправили письмо на указанный email: в нём ссылка для подтверждения или напоминание,
          если аккаунт уже существует. Войти можно уже сейчас.
        </Notice>
      )}
      {reset === '1' && <Notice>Пароль изменён. Войдите с новым паролем.</Notice>}
      <LoginForm next={typeof next === 'string' ? next : undefined} />
      <Link href="/forgot-password" className="text-sm font-medium text-slate-900 underline">
        Забыли пароль?
      </Link>
    </>
  );
}
