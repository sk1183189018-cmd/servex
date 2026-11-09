import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { z } from "zod";
import { Errors } from "../common/errors.js";
import { ENV, type Env } from "../config/env.js";

const ISSUER = "servex";
const AUDIENCE = "servex-api";

const claimsSchema = z.object({
  sub: z.uuid(),
  org: z.uuid().nullish(),
  sid: z.uuid(),
});

export interface AccessClaims {
  userId: string;
  organizationId: string | null;
  sessionId: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Short-lived signed access token. It only identifies the session; permissions are looked up
   *  from the database on every request so role changes take effect immediately. */
  signAccess(claims: AccessClaims): Promise<string> {
    return this.jwt.signAsync(
      { org: claims.organizationId, sid: claims.sessionId },
      {
        secret: this.env.AUTH_JWT_SECRET,
        algorithm: "HS256",
        subject: claims.userId,
        issuer: ISSUER,
        audience: AUDIENCE,
        expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
      },
    );
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.env.AUTH_JWT_SECRET,
        algorithms: ["HS256"],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
    } catch {
      throw Errors.unauthorized("Your session is invalid or has expired");
    }
    const parsed = claimsSchema.safeParse(payload);
    if (!parsed.success) throw Errors.unauthorized("Your session is invalid or has expired");
    return {
      userId: parsed.data.sub,
      organizationId: parsed.data.org ?? null,
      sessionId: parsed.data.sid,
    };
  }

  /** 256 random bits, URL-safe. Only its SHA-256 is stored. */
  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  get accessTtlSeconds(): number {
    return this.env.ACCESS_TOKEN_TTL_SECONDS;
  }

  get refreshTtlMs(): number {
    return this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  }
}
