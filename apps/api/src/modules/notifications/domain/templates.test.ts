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
