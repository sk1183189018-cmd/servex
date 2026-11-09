import { Injectable } from "@nestjs/common";
import argon2 from "argon2";
import { Errors } from "../common/errors.js";

/** OWASP-recommended argon2id settings (19 MiB, 2 iterations, 1 lane). */
const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

@Injectable()
export class PasswordService {
  /** A real hash of a throwaway value, verified against when the account does not exist so that
   *  "no such user" and "wrong password" take about the same time. */
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async verifyAgainstDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash("servex-dummy-password-for-timing");
    await this.verify(await this.dummyHash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON_OPTIONS);
  }

  /** Throws a validation error when the password is too weak for a new account. */
  assertAcceptable(password: string, email: string): void {
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw Errors.validation([
        {
          path: "password",
          message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
        },
      ]);
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      throw Errors.validation([
        { path: "password", message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters` },
      ]);
    }
    const local = email.split("@")[0] ?? "";
    if (local.length >= 4 && password.toLowerCase().includes(local.toLowerCase())) {
      throw Errors.validation([
        { path: "password", message: "Password must not contain your email name" },
      ]);
    }
    if (new Set(password).size < 5) {
      throw Errors.validation([
        { path: "password", message: "Password is too repetitive, use more different characters" },
      ]);
    }
  }
}
