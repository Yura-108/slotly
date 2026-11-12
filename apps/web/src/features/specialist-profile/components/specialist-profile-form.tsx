'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from '@/shared/lib/zod';
import { api } from '@/shared/api/client';
import { fieldErrors, isProblemDetails, problemMessage } from '@/shared/api/errors';
import { Button, FormAlert, Notice, TextField } from '@/shared/ui/form';
import type { SpecialistProfile } from '../server';

const schema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{3,40}$/, 'От 3 до 40 символов: латиница в нижнем регистре, цифры, дефис'),
  displayName: z.string().trim().min(1, 'Укажите имя').max(100, 'Не длиннее 100 символов'),
  bio: z.string().trim().max(2000, 'Не длиннее 2000 символов'),
  timezone: z.string().min(1),
  confirmationMode: z.enum(['auto', 'manual']),
  minNoticeMinutes: z.coerce.number<string>().int().min(0).max(10080),
  bookingHorizonDays: z.coerce.number<string>().int().min(1, 'От 1 дня').max(365, 'До 365 дней'),
  clientCancelDeadlineHours: z.coerce.number<string>().int().min(0).max(720, 'Не больше 720 часов'),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

const NOTICE_OPTIONS = [
  [0, 'Без ограничения'],
  [30, '30 минут'],
  [60, '1 час'],
  [120, '2 часа'],
  [240, '4 часа'],
  [720, '12 часов'],
  [1440, '1 сутки'],
  [2880, '2 суток'],
] as const;

const FIELDS = [
  'slug',
  'displayName',
  'bio',
  'timezone',
  'confirmationMode',
  'minNoticeMinutes',
  'bookingHorizonDays',
  'clientCancelDeadlineHours',
] as const;

/**
 * One form for enabling (POST) and editing (PATCH) the profile. Validation here is only for
 * quick feedback; the API checks the same ranges and slug uniqueness (409 SLUG_TAKEN).
 */
export function SpecialistProfileForm({
  profile,
  defaultTimeZone,
  timeZones,
}: {
  profile: SpecialistProfile | null;
  defaultTimeZone: string;
  timeZones: string[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const defaults: FormInput = {
    slug: profile?.slug ?? '',
    displayName: profile?.displayName ?? '',
    bio: profile?.bio ?? '',
    timezone: profile?.timezone ?? defaultTimeZone,
    confirmationMode: profile?.confirmationMode ?? 'manual',
    minNoticeMinutes: String(profile?.minNoticeMinutes ?? 120),
    bookingHorizonDays: String(profile?.bookingHorizonDays ?? 60),
    clientCancelDeadlineHours: String(profile?.clientCancelDeadlineHours ?? 24),
  };
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    const body = { ...values, bio: values.bio === '' ? null : values.bio };
    try {
      const { data, error } = profile
        ? await api.PATCH('/me/specialist-profile', { body })
        : await api.POST('/me/specialist-profile', { body });
      if (error) {
        if (isProblemDetails(error) && error.code === 'SLUG_TAKEN') {
          setError('slug', { message: error.detail });
          return;
        }
        const byField = fieldErrors(error);
        for (const field of FIELDS) {
          const message = byField[field];
          if (message) setError(field, { message });
        }
        if (Object.keys(byField).length === 0) setFormError(problemMessage(error));
        return;
      }
      if (!profile) {
        router.push('/specialist/services');
        router.refresh();
        return;
      }
      reset({
        ...defaults,
        ...data,
        bio: data.bio ?? '',
        minNoticeMinutes: String(data.minNoticeMinutes),
        bookingHorizonDays: String(data.bookingHorizonDays),
        clientCancelDeadlineHours: String(data.clientCancelDeadlineHours),
      });
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setFormError(problemMessage(cause));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-lg flex-col gap-5">
      {formError && <FormAlert>{formError}</FormAlert>}
      {saved && !isDirty && <Notice>Изменения сохранены.</Notice>}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-medium">Публичная страница</legend>
        <TextField
          id="displayName"
          label="Имя на странице"
          error={errors.displayName?.message}
          {...register('displayName')}
        />
        <TextField
          id="slug"
          label="Адрес страницы"
          hint={
            profile
              ? 'После смены адреса старые ссылки на страницу перестанут работать.'
              : 'Будет доступна по адресу /book/ваш-адрес.'
          }
          autoCapitalize="none"
          spellCheck={false}
          error={errors.slug?.message}
          {...register('slug')}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="bio" className="text-sm font-medium text-slate-700">
            О себе
          </label>
          <textarea
            id="bio"
            rows={4}
            className="rounded-md border border-slate-300 px-3 py-2 text-base"
            {...register('bio')}
          />
          {errors.bio?.message && <p className="text-sm text-red-700">{errors.bio.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="timezone" className="text-sm font-medium text-slate-700">
            Часовой пояс расписания
          </label>
          <select
            id="timezone"
            // register() sets the value only after hydration; this puts it into the server HTML
            defaultValue={defaults.timezone}
            className="rounded-md border border-slate-300 px-3 py-2 text-base"
            {...register('timezone')}
          >
            {timeZones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-medium">Правила записи</legend>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Подтверждение записей</span>
          <label className="flex items-center gap-2">
            <input type="radio" value="manual" {...register('confirmationMode')} />
            Вручную — я подтверждаю каждую запись
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" value="auto" {...register('confirmationMode')} />
            Автоматически — запись подтверждается сразу
          </label>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="minNoticeMinutes" className="text-sm font-medium text-slate-700">
            Записываться не позже чем за
          </label>
          <select
            id="minNoticeMinutes"
            defaultValue={defaults.minNoticeMinutes}
            className="rounded-md border border-slate-300 px-3 py-2 text-base"
            {...register('minNoticeMinutes')}
          >
            {NOTICE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <TextField
          id="bookingHorizonDays"
          label="Открывать запись на дней вперёд"
          type="number"
          min={1}
          max={365}
          error={errors.bookingHorizonDays?.message}
          {...register('bookingHorizonDays')}
        />
        <TextField
          id="clientCancelDeadlineHours"
          label="Клиент может отменить не позже чем за (часов)"
          type="number"
          min={0}
          max={720}
          hint="Позже отменить запись сможете только вы."
          error={errors.clientCancelDeadlineHours?.message}
          {...register('clientCancelDeadlineHours')}
        />
      </fieldset>

      <Button type="submit" disabled={isSubmitting || (profile !== null && !isDirty)}>
        {isSubmitting ? 'Сохраняем…' : profile ? 'Сохранить' : 'Включить профиль специалиста'}
      </Button>
    </form>
  );
}
