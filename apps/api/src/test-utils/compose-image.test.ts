import { describe, expect, it } from 'vitest';
import { composeImage } from './compose-image';

describe('composeImage', () => {
  it('reads each service image from compose.yaml', () => {
    expect(composeImage('postgres') + 'x').toMatch(/^postgres:\d+\.\d+-alpine$/);
    expect(composeImage('mailpit')).toMatch(/^axllent\/mailpit:v\d+\.\d+\.\d+$/);
  });
});
