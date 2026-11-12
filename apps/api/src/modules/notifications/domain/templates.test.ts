import { describe, expect, it } from 'vitest';
import { renderEmail } from './templates';

describe('renderEmail', () => {
  it('puts the confirmation link into text and HTML', () => {
    const link = 'https://slotly.example/verify-email#token=abc';
    const email = renderEmail({
      type: 'auth.verify_email',
      payload: { to: 'anna@example.test', name: 'Анна', link },
    });
    expect(email.subject).toBe('Подтвердите email в Slotly');
    expect(email.text).toContain(link);
    expect(email.text).toContain('Здравствуйте, Анна!');
    expect(email.html).toContain(`href="${link}"`);
  });

  it('escapes user-controlled data in HTML', () => {
    const email = renderEmail({
      type: 'auth.password_reset',
      payload: {
        to: 'x@example.test',
        name: '<img src=x onerror=alert(1)>',
        link: 'https://slotly.example/reset-password#token=t',
      },
    });
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('greets without a name when it is unknown', () => {
    const email = renderEmail({
      type: 'auth.account_exists',
      payload: {
        to: 'x@example.test',
        loginUrl: 'https://slotly.example/login',
        resetUrl: 'https://slotly.example/forgot-password',
      },
    });
    expect(email.text.startsWith('Здравствуйте!')).toBe(true);
    expect(email.text).toContain('https://slotly.example/forgot-password');
  });
});

describe('booking emails', () => {
  const booking = {
    serviceName: 'Консультация',
    startAt: '2026-11-19T11:00:00.000Z',
    endAt: '2026-11-19T12:00:00.000Z',
    bookingsUrl: 'https://slotly.example/bookings',
  };

  it("shows the time on each recipient's clock", () => {
    const specialist = renderEmail({
      type: 'booking.new_for_specialist',
      payload: {
        ...booking,
        to: 's@example.test',
        timeZone: 'Europe/Berlin',
        clientName: 'Анна',
        needsConfirmation: true,
      },
    });
    const client = renderEmail({
      type: 'booking.created_for_client',
      payload: {
        ...booking,
        to: 'c@example.test',
        timeZone: 'Europe/Moscow',
        specialistName: 'Ирина',
        status: 'pending',
      },
    });
    expect(specialist.text).toContain('четверг, 19 ноября 2026 г., 12:00–13:00 (Europe/Berlin)');
    expect(client.text).toContain('четверг, 19 ноября 2026 г., 14:00–15:00 (Europe/Moscow)');
  });

  it('tells whether the booking waits for confirmation', () => {
    const base = { ...booking, to: 's@example.test', timeZone: 'UTC', clientName: 'Анна' };
    const request = renderEmail({
      type: 'booking.new_for_specialist',
      payload: { ...base, needsConfirmation: true },
    });
    const confirmed = renderEmail({
      type: 'booking.new_for_specialist',
      payload: { ...base, needsConfirmation: false },
    });
    expect(request.subject).toBe('Новая заявка: Консультация');
    expect(request.text).toContain('ждёт вашего подтверждения');
    expect(confirmed.subject).toBe('Новая запись: Консультация');
    expect(confirmed.text).toContain('подтверждена автоматически');
  });

  it('escapes names and service names in HTML', () => {
    const email = renderEmail({
      type: 'booking.created_for_client',
      payload: {
        ...booking,
        serviceName: '<script>x</script>',
        to: 'c@example.test',
        timeZone: 'UTC',
        specialistName: '<b>Ирина</b>',
        status: 'confirmed',
      },
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>');
    expect(email.subject).toBe('Вы записаны: <script>x</script>'); // a header, not HTML
  });
});

describe('booking status emails', () => {
  const base = {
    to: 'c@example.test',
    serviceName: 'Консультация',
    startAt: '2026-11-19T11:00:00.000Z',
    endAt: '2026-11-19T12:00:00.000Z',
    timeZone: 'UTC',
    bookingsUrl: 'https://slotly.example/bookings',
  };

  it('includes the reason only when it was given, escaped in HTML', () => {
    const withReason = renderEmail({
      type: 'booking.rejected',
      payload: { ...base, specialistName: 'Ирина', reason: 'Заболела <b>сильно</b>' },
    });
    const without = renderEmail({
      type: 'booking.rejected',
      payload: { ...base, specialistName: 'Ирина' },
    });
    expect(withReason.text).toContain('Причина: Заболела <b>сильно</b>');
    expect(withReason.html).toContain('Причина: Заболела &lt;b&gt;сильно&lt;/b&gt;');
    expect(without.text).not.toContain('Причина');
  });

  it('tells each side what a cancellation means for them', () => {
    const toSpecialist = renderEmail({
      type: 'booking.cancelled',
      payload: { ...base, cancelledBy: 'client', byName: 'Анна' },
    });
    const toClient = renderEmail({
      type: 'booking.cancelled',
      payload: { ...base, cancelledBy: 'specialist', byName: 'Ирина' },
    });
    expect(toSpecialist.subject).toBe('Запись отменена: Консультация');
    expect(toSpecialist.text).toContain('Анна отменяет запись');
    expect(toSpecialist.text).toContain('снова свободно');
    expect(toClient.text).toContain('Ирина отменяет запись');
    expect(toClient.text).toContain('другое время');
  });

  it('confirms with the time on the recipient clock', () => {
    const email = renderEmail({
      type: 'booking.confirmed',
      payload: { ...base, timeZone: 'Europe/Moscow', specialistName: 'Ирина' },
    });
    expect(email.subject).toBe('Запись подтверждена: Консультация');
    expect(email.text).toContain('14:00–15:00 (Europe/Moscow)');
  });
});

describe('expired request email', () => {
  it('offers to choose another time on the specialist page', () => {
    const email = renderEmail({
      type: 'booking.expired',
      payload: {
        to: 'c@example.test',
        name: 'Анна',
        serviceName: 'Консультация',
        startAt: '2026-11-19T11:00:00.000Z',
        endAt: '2026-11-19T12:00:00.000Z',
        timeZone: 'Europe/Moscow',
        bookingsUrl: 'https://slotly.example/bookings',
        specialistName: 'Ирина',
        specialistUrl: 'https://slotly.example/book/irina',
      },
    });
    expect(email.subject).toBe('Заявка истекла: Консультация');
    expect(email.text).toContain('осталась без ответа');
    expect(email.text).toContain('14:00–15:00 (Europe/Moscow)');
    expect(email.html).toContain('href="https://slotly.example/book/irina"');
  });
});
