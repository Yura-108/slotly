'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/shared/api/client';
import { fieldErrors, problemMessage } from '@/shared/api/errors';
import { Button, FormAlert, Notice, TextField } from '@/shared/ui/form';
import { forgotPasswordFormSchema, type ForgotPasswordFormValues } from '../schemas';

export function ForgotPasswordForm() {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordFormSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { error } = await api.POST('/auth/password-reset/request', { body: values });
      if (error) {
        const message = fieldErrors(error)['email'];
        if (message) setError('email', { message });
        else setFormError(problemMessage(error));
        return;
      }
      setDone(true);
    } catch (cause) {
      setFormError(problemMessage(cause));
    }
  });

  if (done) {
    return (
      // Same text whether the account exists or not (ADR-005)
      <Notice>
        Если аккаунт с этим email существует, мы отправили письмо со ссылкой для сброса пароля.
        Ссылка действует 1 час.
      </Notice>
    );
  }

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
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Отправляем…' : 'Отправить ссылку'}
      </Button>
      <Link href="/login" className="text-sm font-medium text-slate-900 underline">
        Вернуться ко входу
      </Link>
    </form>
  );
}
