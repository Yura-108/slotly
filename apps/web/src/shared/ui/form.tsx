import type { ComponentProps, ReactNode } from 'react';

/** Minimal form primitives; replaced by the design system (shadcn/ui) when it is introduced. */

export function TextField({
  label,
  error,
  hint,
  id,
  ...input
}: ComponentProps<'input'> & { id: string; label: string; error?: string; hint?: string }) {
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 aria-[invalid=true]:border-red-600"
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function Button({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      className={`rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
      {children}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      {children}
    </p>
  );
}
