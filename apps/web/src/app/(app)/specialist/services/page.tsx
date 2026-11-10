import type { Metadata } from 'next';
import Link from 'next/link';
import { ServicesManager } from '@/features/services/components/services-manager';
import { getMyServices } from '@/features/services/server';

export const metadata: Metadata = { title: 'Услуги — Slotly' };

export default async function SpecialistServicesPage() {
  const services = await getMyServices();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Услуги</h1>
      {services === 'profile_required' ? (
        <p className="text-slate-600">
          Услуги доступны специалистам.{' '}
          <Link href="/specialist/settings" className="font-medium text-slate-900 underline">
            Включить профиль специалиста
          </Link>
        </p>
      ) : (
        <ServicesManager services={services} />
      )}
    </section>
  );
}
