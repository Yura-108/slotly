import { describe, expect, it } from 'vitest';
import { statusLabel } from './labels';

describe('statusLabel', () => {
  it('speaks from the viewer side', () => {
    expect(statusLabel({ status: 'pending', party: 'client', cancelledBy: null })).toBe(
      'Ждёт подтверждения',
    );
    expect(statusLabel({ status: 'pending', party: 'specialist', cancelledBy: null })).toBe(
      'Ждёт вашего ответа',
    );
  });

  it('tells who cancelled', () => {
    expect(statusLabel({ status: 'cancelled', party: 'client', cancelledBy: 'client' })).toBe(
      'Вы отменили',
    );
    expect(statusLabel({ status: 'cancelled', party: 'client', cancelledBy: 'specialist' })).toBe(
      'Отменена специалистом',
    );
    expect(statusLabel({ status: 'cancelled', party: 'specialist', cancelledBy: 'client' })).toBe(
      'Отменена клиентом',
    );
  });
});
