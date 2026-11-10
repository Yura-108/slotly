'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/shared/api/client';
import { fieldErrors, problemMessage } from '@/shared/api/errors';
import { formatDuration } from '@/shared/lib/format';
import { Button, FormAlert, TextField } from '@/shared/ui/form';
import type { MyService } from '../server';

const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(100, 'Не длиннее 100 символов'),
  description: z.string().trim().max(2000, 'Не длиннее 2000 символов'),
  durationMinutes: z.coerce
    .number<string>()
    .int()
    .min(15, 'От 15 минут')
    .max(480, 'До 8 часов')
    .multipleOf(5, 'Кратно 5 минутам'),
});

type ServiceInput = z.input<typeof serviceSchema>;
type ServiceValues = z.output<typeof serviceSchema>;
const FIELDS = ['name', 'description', 'durationMinutes'] as const;

function ServiceForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ServiceInput;
  submitLabel: string;
  onSubmit: (values: ServiceValues) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ServiceInput, unknown, ServiceValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: initial,
  });
  const idPrefix = submitLabel === 'Добавить' ? 'new' : 'edit';

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const error = await onSubmit(values);
    if (!error) {
      if (!onCancel) reset(initial);
      return;
    }
    const byField = fieldErrors(error);
    for (const field of FIELDS) {
      const message = byField[field];
      if (message) setError(field, { message });
    }
    if (Object.keys(byField).length === 0) setFormError(problemMessage(error));
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      {formError && <FormAlert>{formError}</FormAlert>}
      <TextField
        id={`${idPrefix}-name`}
        label="Название"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        id={`${idPrefix}-duration`}
        label="Длительность, минут"
        type="number"
        min={15}
        max={480}
        step={5}
        error={errors.durationMinutes?.message}
        {...register('durationMinutes')}
      />
      <TextField
        id={`${idPrefix}-description`}
        label="Описание (необязательно)"
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Сохраняем…' : submitLabel}
        </Button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm underline">
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

/** Changes go browser → /api/* (ADR-009); afterwards the server-rendered list is refreshed. */
export function ServicesManager({ services }: { services: MyService[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const active = services.filter((s) => !s.archived);
  const archived = services.filter((s) => s.archived);

  async function create(values: ServiceValues) {
    try {
      const { error } = await api.POST('/me/services', {
        body: { ...values, description: values.description || null },
      });
      if (!error) router.refresh();
      return error;
    } catch (cause) {
      return cause;
    }
  }

  async function update(id: string, values: ServiceValues) {
    try {
      const { error } = await api.PATCH('/me/services/{id}', {
        params: { path: { id } },
        body: { ...values, description: values.description || null },
      });
      if (!error) {
        setEditingId(null);
        router.refresh();
      }
      return error;
    } catch (cause) {
      return cause;
    }
  }

  async function archive(id: string) {
    setRowError(null);
    try {
      const { error } = await api.POST('/me/services/{id}/archive', { params: { path: { id } } });
      if (error) setRowError(problemMessage(error));
      else router.refresh();
    } catch (cause) {
      setRowError(problemMessage(cause));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {rowError && <FormAlert>{rowError}</FormAlert>}
      <ul className="flex flex-col gap-3">
        {active.length === 0 && <li className="text-slate-600">Пока нет ни одной услуги.</li>}
        {active.map((service) => (
          <li key={service.id} className="rounded-lg border border-slate-200 p-4">
            {editingId === service.id ? (
              <ServiceForm
                initial={{
                  name: service.name,
                  description: service.description ?? '',
                  durationMinutes: String(service.durationMinutes),
                }}
                submitLabel="Сохранить"
                onSubmit={(values) => update(service.id, values)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{service.name}</p>
                  <p className="text-sm text-slate-600">
                    {formatDuration(service.durationMinutes)}
                  </p>
                  {service.description && (
                    <p className="mt-1 text-sm text-slate-600">{service.description}</p>
                  )}
                </div>
                <div className="flex gap-3 text-sm">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setEditingId(service.id)}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className="text-slate-600 underline"
                    onClick={() => void archive(service.id)}
                  >
                    В архив
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <section className="flex max-w-lg flex-col gap-3">
        <h2 className="text-lg font-medium">Новая услуга</h2>
        <ServiceForm
          initial={{ name: '', description: '', durationMinutes: '60' }}
          submitLabel="Добавить"
          onSubmit={create}
        />
      </section>

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Архив</h2>
          <p className="text-sm text-slate-600">
            Клиенты не видят эти услуги; уже созданные записи на них сохраняются.
          </p>
          <ul className="flex flex-col gap-1 text-slate-600">
            {archived.map((service) => (
              <li key={service.id}>
                {service.name} · {formatDuration(service.durationMinutes)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
