'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/shared/api/client';
import { fieldErrors, problemMessage } from '@/shared/api/errors';
import { useFragmentToken } from '@/shared/lib/use-fragment-token';
import { Button, FormAlert, TextField } from '@/shared/ui/form';
import { resetPasswordFormSchema, type ResetPasswordFormValues } from '../schemas';

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useFragmentToken();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordFormSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) return;
    setFormError(null);
    try {
      const { error } = await api.POST('/auth/password-reset/confirm', {
        body: { token, password },
      });
      if (error) {
        const message = fieldErrors(error)['password'];
        if (message) setError('password', { message });
        else setFormError(problemMessage(error));
        return;
      }
      router.replace('/login?reset=1');
    } catch (cause) {
      setFormError(problemMessage(cause));
    }
  });

  if (token === undefined) return <p className="text-slate-600">Загрузка…</p>;
  if (token === null) {
    return (
      <div className="flex flex-col gap-3">
        <FormAlert>В ссылке нет кода сброса пароля.</FormAlert>
        <Link href="/forgot-password" className="text-sm font-medium text-slate-900 underline">
          Запросить новую ссылку
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && (
        <div className="flex flex-col gap-2">
          <FormAlert>{formError}</FormAlert>
          <Link href="/forgot-password" className="text-sm font-medium text-slate-900 underline">
            Запросить новую ссылку
          </Link>
        </div>
      )}
      <TextField
        id="password"
        label="Новый пароль"
        type="password"
        autoComplete="new-password"
        hint="Не меньше 8 символов. После смены пароля все сеансы будут завершены."
        error={errors.password?.message}
        {...register('password')}
      />
      <TextField
        id="passwordConfirmation"
        label="Повторите пароль"
        type="password"
        autoComplete="new-password"
        error={errors.passwordConfirmation?.message}
        {...register('passwordConfirmation')}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Сохраняем…' : 'Сменить пароль'}
      </Button>
    </form>
  );
}
