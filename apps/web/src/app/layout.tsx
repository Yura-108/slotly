import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Slotly',
  description: 'Онлайн-запись к специалистам',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page renders per request: its scripts need the nonce of this response (ADR-014)
  await connection();
  return (
    <html lang="ru">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
