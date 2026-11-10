import { describe, expect, it } from 'vitest';
import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('produces Argon2id hashes with the OWASP parameters', async () => {
    const passwordHash = await hasher.hash('correct horse battery staple');
    expect(passwordHash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(hasher.needsRehash(passwordHash)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hasher.hash('same password')).not.toBe(await hasher.hash('same password'));
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const passwordHash = await hasher.hash('s3cret-passw0rd');
    expect(await hasher.verify(passwordHash, 's3cret-passw0rd')).toBe(true);
    expect(await hasher.verify(passwordHash, 'S3cret-passw0rd')).toBe(false);
  });

  it('asks to re-hash hashes made with weaker parameters', () => {
    expect(hasher.needsRehash('$argon2id$v=19$m=4096,t=3,p=1$c2FsdA$aGFzaA')).toBe(true);
  });

  it('runs a dummy verification without throwing', async () => {
    await expect(hasher.verifyDummy('anything')).resolves.toBeUndefined();
  });
});
