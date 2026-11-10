import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-semibold tracking-tight">Slotly</h1>
      <p className="text-lg text-slate-600">
        Онлайн-запись к специалистам: выберите удобное время — специалист получит заявку.
      </p>
      <div className="flex gap-3">
        <Link
          href="/register"
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
        >
          Зарегистрироваться
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-slate-300 px-4 py-2 font-medium hover:border-slate-900"
        >
          Войти
        </Link>
      </div>
    </main>
  );
}
