import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id with the OWASP Password Storage Cheat Sheet minimum: 19 MiB, 2 passes, 1 lane.
 * The algorithm defaults to Argon2id in @node-rs/argon2 (its `Algorithm` is a const enum,
 * unusable with isolatedModules); the unit test pins the produced `$argon2id$` prefix.
 * Parameters live inside each hash, so they can be raised later and old hashes still verify.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const CURRENT_PREFIX = `$argon2id$v=19$m=${OPTIONS.memoryCost},t=${OPTIONS.timeCost},p=${OPTIONS.parallelism}$`;

@Injectable()
export class PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  /**
   * Burns the same time as a real check when the user does not exist, so response
   * time does not reveal whether an email is registered (ADR-005).
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('dummy password for timing equalization');
    await verify(await this.dummyHash, password);
  }

  /** True when the hash was made with other parameters: re-hash after a successful login. */
  needsRehash(passwordHash: string): boolean {
    return !passwordHash.startsWith(CURRENT_PREFIX);
  }
}
