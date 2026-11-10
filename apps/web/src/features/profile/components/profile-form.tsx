'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/shared/api/client';
import { fieldErrors, problemMessage } from '@/shared/api/errors';
import { Button, FormAlert, Notice, TextField } from '@/shared/ui/form';

const profileFormSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя').max(100, 'Не длиннее 100 символов'),
  timezone: z.string().min(1, 'Выберите часовой пояс'),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

/**
 * `timeZones` comes from the server, so the list rendered on the server and in the browser
 * is identical (different ICU versions would otherwise cause a hydration mismatch).
 */
export function ProfileForm({
  defaults,
  timeZones,
}: {
  defaults: ProfileFormValues;
  timeZones: string[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    try {
      const { data, error } = await api.PATCH('/me', { body: values });
      if (error) {
        const byField = fieldErrors(error);
        for (const field of ['name', 'timezone'] as const) {
          const message = byField[field];
          if (message) setError(field, { message });
        }
        if (Object.keys(byField).length === 0) setFormError(problemMessage(error));
        return;
      }
      reset({ name: data.name, timezone: data.timezone });
      setSaved(true);
      // The header shows the name from the server; refresh server components
      router.refresh();
    } catch (cause) {
      setFormError(problemMessage(cause));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-sm flex-col gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      {saved && !isDirty && <Notice>Изменения сохранены.</Notice>}
      <TextField
        id="name"
        label="Имя"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="timezone" className="text-sm font-medium text-slate-700">
          Часовой пояс
        </label>
        <select
          id="timezone"
          // register() sets the value only after hydration; this puts it into the server HTML
          defaultValue={defaults.timezone}
          aria-describedby="timezone-hint"
          className="rounded-md border border-slate-300 px-3 py-2 text-base"
          {...register('timezone')}
        >
          {timeZones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p id="timezone-hint" className="text-sm text-slate-500">
          В нём показывается время в письмах и в личном кабинете.
        </p>
        {errors.timezone?.message && (
          <p className="text-sm text-red-700">{errors.timezone.message}</p>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? 'Сохраняем…' : 'Сохранить'}
      </Button>
    </form>
  );
}
