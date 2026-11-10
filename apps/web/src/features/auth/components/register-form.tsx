'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/shared/api/client';
import { fieldErrors, problemMessage } from '@/shared/api/errors';
import { useBrowserTimeZone } from '@/shared/lib/use-browser-time-zone';
import { Button, FormAlert, TextField } from '@/shared/ui/form';
import { registerFormSchema, type RegisterFormValues } from '../schemas';

export function RegisterForm() {
  const router = useRouter();
  // The server cannot know the user's time zone, so it is sent at registration (data-model.md)
  const timeZone = useBrowserTimeZone();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerFormSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { error } = await api.POST('/auth/register', {
        body: { ...values, timezone: timeZone ?? 'UTC' },
      });
      if (error) {
        const byField = fieldErrors(error);
        for (const field of ['name', 'email', 'password'] as const) {
          const message = byField[field];
          if (message) setError(field, { message });
        }
        if (Object.keys(byField).length === 0) setFormError(problemMessage(error));
        return;
      }
      router.push('/login?registered=1');
    } catch (cause) {
      setFormError(problemMessage(cause));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      <TextField
        id="name"
        label="Имя"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        id="password"
        label="Пароль"
        type="password"
        autoComplete="new-password"
        hint="Не меньше 8 символов. Длинная фраза надёжнее сложного короткого пароля."
        error={errors.password?.message}
        {...register('password')}
      />
      <p className="text-sm text-slate-500">Часовой пояс: {timeZone ?? '…'}</p>
      <Button type="submit" disabled={isSubmitting || !timeZone}>
        {isSubmitting ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
      </Button>
      <p className="text-sm text-slate-600">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="font-medium text-slate-900 underline">
          Войти
        </Link>
      </p>
    </form>
  );
}
