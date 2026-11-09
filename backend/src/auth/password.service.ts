import { Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

/** argon2id with the library defaults (the parameters its authors recommend). */
@Injectable()
export class PasswordService implements OnModuleInit {
  // Valid hash of a random value, built once at startup with the same parameters
  // as real hashes, so a dummy verify costs the same as a real one.
  private dummyHash!: string;

  async onModuleInit() {
    this.dummyHash = await this.hash(randomBytes(16).toString('hex'));
  }

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  /** Burns the time of one verify (unknown email) without ever succeeding. */
  async verifyDummy(plain: string): Promise<void> {
    await argon2.verify(this.dummyHash, plain);
  }
}
