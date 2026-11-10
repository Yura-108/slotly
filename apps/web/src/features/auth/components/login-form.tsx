'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/shared/api/client';
import { fieldErrors, problemMessage } from '@/shared/api/errors';
import { safeRedirectPath } from '@/shared/lib/safe-redirect';
import { Button, FormAlert, TextField } from '@/shared/ui/form';
import { loginFormSchema, type LoginFormValues } from '../schemas';

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { error } = await api.POST('/auth/login', { body: values });
      if (error) {
        const byField = fieldErrors(error);
        for (const field of ['email', 'password'] as const) {
          const message = byField[field];
          if (message) setError(field, { message });
        }
        if (Object.keys(byField).length === 0) setFormError(problemMessage(error));
        return;
      }
      // The cookie is set; re-render server components so they see the new session
      router.replace(safeRedirectPath(next));
      router.refresh();
    } catch (cause) {
      setFormError(problemMessage(cause));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
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
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Входим…' : 'Войти'}
      </Button>
      <p className="text-sm text-slate-600">
        Нет аккаунта?{' '}
        <Link href="/register" className="font-medium text-slate-900 underline">
          Зарегистрироваться
        </Link>
      </p>
    </form>
  );
}
