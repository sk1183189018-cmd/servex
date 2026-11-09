import { randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { CURRENCY_EXPONENTS } from "@servex/shared";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { AuditService } from "../audit/audit.service.js";
import { Errors, first } from "../common/errors.js";
import { PG_UNIQUE_VIOLATION, pgErrorOf } from "../common/pg-errors.js";
import type { ClientMeta } from "../common/request.js";
import { DatabaseService, type Executor } from "../db/database.service.js";
import {
  branches,
  memberships,
  organizations,
  refreshTokens,
  users,
  type MembershipRole,
} from "../db/schema.js";
import type { AuthContext } from "./auth-context.js";
import { AuthContextLoader } from "./auth-context.loader.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";
import { ENV, type Env } from "../config/env.js";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
/** A rotated refresh token presented again within this window is treated as a double submit
 *  (two tabs refreshing at once), not as theft. */
const REFRESH_REUSE_GRACE_MS = 10_000;

const COUNTRY_DEFAULTS: Readonly<Record<string, { currency: string; timezone: string }>> = {
  IN: { currency: "INR", timezone: "Asia/Kolkata" },
  US: { currency: "USD", timezone: "America/New_York" },
  GB: { currency: "GBP", timezone: "Europe/London" },
  AE: { currency: "AED", timezone: "Asia/Dubai" },
  SA: { currency: "SAR", timezone: "Asia/Riyadh" },
  SG: { currency: "SGD", timezone: "Asia/Singapore" },
  AU: { currency: "AUD", timezone: "Australia/Sydney" },
  CA: { currency: "CAD", timezone: "America/Toronto" },
  JP: { currency: "JPY", timezone: "Asia/Tokyo" },
};

export interface SessionResult {
  tokenType: "Bearer";
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; fullName: string };
  organization: { id: string; name: string; slug: string } | null;
  role: string;
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug === "" ? "company" : slug;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly loader: AuthContextLoader,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Create a company, its owner and a head-office branch in one transaction, then sign in. */
  async register(input: RegisterInput, meta: ClientMeta): Promise<SessionResult> {
    this.passwords.assertAcceptable(input.password, input.email);

    const defaults = COUNTRY_DEFAULTS[input.countryCode];
    const currency = input.currency ?? defaults?.currency;
    if (currency === undefined || !Object.hasOwn(CURRENCY_EXPONENTS, currency)) {
      throw Errors.validation([
        {
          path: "currency",
          message:
            currency === undefined
              ? "Currency is required for this country"
              : `Currency ${currency} is not supported yet`,
        },
      ]);
    }
    const timezone = input.timezone ?? defaults?.timezone ?? "UTC";
    if (!isValidTimezone(timezone)) {
      throw Errors.validation([{ path: "timezone", message: "Unknown timezone" }]);
    }

    const passwordHash = await this.passwords.hash(input.password);
    const baseSlug = slugify(input.organizationName);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(2).toString("hex")}`;
      try {
        const created = await this.database.root.transaction(async (tx) => {
          const organization = first(
            await tx
              .insert(organizations)
              .values({
                name: input.organizationName,
                slug,
                countryCode: input.countryCode,
                defaultCurrency: currency,
                timezone,
                locale: input.locale,
              })
              .returning(),
            "organization",
          );
          const user = first(
            await tx
              .insert(users)
              .values({
                email: input.email,
                passwordHash,
                fullName: input.fullName,
                phone: input.phone ?? null,
                locale: input.locale,
              })
              .returning(),
            "user",
          );
          await tx.insert(memberships).values({
            organizationId: organization.id,
            userId: user.id,
            role: "company_owner",
          });
          await tx
            .insert(branches)
            .values({ organizationId: organization.id, name: "Head Office", code: "HQ" });
          await this.audit.record(tx, {
            organizationId: organization.id,
            actorUserId: user.id,
            action: "organization.created",
            entityType: "organization",
            entityId: organization.id,
            metadata: { slug, countryCode: input.countryCode, currency },
            meta,
          });
          await this.audit.record(tx, {
            organizationId: organization.id,
            actorUserId: user.id,
            action: "auth.registered",
            entityType: "user",
            entityId: user.id,
            meta,
          });
          return { organization, user };
        });

        return this.startSession(
          this.database.root,
          { id: created.user.id, email: created.user.email, fullName: created.user.fullName },
          { id: created.organization.id, name: created.organization.name, slug },
          "company_owner",
          meta,
        );
      } catch (error) {
        const pg = pgErrorOf(error);
        if (pg?.code === PG_UNIQUE_VIOLATION) {
          if (pg.constraint === "organizations_slug_key") continue;
          if (pg.constraint === "users_email_key") {
            throw Errors.conflict("EMAIL_TAKEN", "An account with this email already exists");
          }
        }
        throw error;
      }
    }
    throw Errors.conflict(
      "SLUG_UNAVAILABLE",
      "Could not reserve a company address, try another name",
    );
  }

  async login(input: LoginInput, meta: ClientMeta): Promise<SessionResult> {
    const invalid = Errors.unauthorized(
      "Invalid email or password, or the account is temporarily locked",
    );
    const root = this.database.root;

    const [user] = await root.select().from(users).where(eq(users.email, input.email)).limit(1);
    if (user === undefined) {
      await this.passwords.verifyAgainstDummy(input.password);
      throw invalid;
    }

    const now = new Date();
    if (user.lockedUntil !== null && user.lockedUntil > now) {
      await this.audit.record(root, {
        organizationId: null,
        actorUserId: user.id,
        action: "auth.login_blocked",
        entityType: "user",
        entityId: user.id,
        metadata: { reason: "locked" },
        meta,
      });
      throw invalid;
    }

    if (!(await this.passwords.verify(user.passwordHash, input.password))) {
      const [updated] = await root
        .update(users)
        .set({ failedLoginCount: sql`${users.failedLoginCount} + 1` })
        .where(eq(users.id, user.id))
        .returning({ failedLoginCount: users.failedLoginCount });
      const locked = (updated?.failedLoginCount ?? 0) >= MAX_FAILED_LOGINS;
      if (locked) {
        await root
          .update(users)
          .set({
            failedLoginCount: 0,
            lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
          })
          .where(eq(users.id, user.id));
      }
      await this.audit.record(root, {
        organizationId: null,
        actorUserId: user.id,
        action: locked ? "auth.account_locked" : "auth.login_failed",
        entityType: "user",
        entityId: user.id,
        meta,
      });
      throw invalid;
    }

    if (user.status !== "active") {
      throw Errors.forbidden("This account has been disabled");
    }

    // Password was right: clear the failure counters and upgrade the hash if settings moved on.
    await root
      .update(users)
      .set({
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
        ...(this.passwords.needsRehash(user.passwordHash)
          ? { passwordHash: await this.passwords.hash(input.password) }
          : {}),
      })
      .where(eq(users.id, user.id));

    const candidates = await root
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(
        and(
          eq(memberships.userId, user.id),
          eq(memberships.status, "active"),
          eq(organizations.status, "active"),
          isNull(organizations.deletedAt),
        ),
      );

    let chosen: (typeof candidates)[number] | null = null;
    if (input.organizationSlug !== undefined) {
      chosen = candidates.find((candidate) => candidate.slug === input.organizationSlug) ?? null;
      if (chosen === null) throw Errors.forbidden("You do not have access to this company");
    } else if (!user.isPlatformAdmin) {
      if (candidates.length === 0)
        throw Errors.forbidden("You do not belong to any active company");
      if (candidates.length > 1) {
        throw Errors.conflict(
          "ORGANIZATION_SELECTION_REQUIRED",
          "This account belongs to several companies. Choose one.",
          {
            organizations: candidates.map((candidate) => ({
              slug: candidate.slug,
              name: candidate.name,
            })),
          },
        );
      }
      chosen = candidates[0] ?? null;
    }

    const session = await this.startSession(
      root,
      { id: user.id, email: user.email, fullName: user.fullName },
      chosen === null ? null : { id: chosen.id, name: chosen.name, slug: chosen.slug },
      chosen?.role ?? "super_admin",
      meta,
    );
    await this.audit.record(root, {
      organizationId: chosen?.id ?? null,
      actorUserId: user.id,
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      meta,
    });
    return session;
  }

  /**
   * Rotate a refresh token. Each token works once. Presenting an old one again revokes the whole
   * session family, because that means a copy of the token is in someone else's hands.
   */
  async refresh(rawToken: string, meta: ClientMeta): Promise<SessionResult> {
    const invalid = Errors.unauthorized("Your session is invalid or has expired");
    const root = this.database.root;
    const hash = this.tokens.hashRefreshToken(rawToken);

    const [row] = await root
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hash))
      .limit(1);
    if (row === undefined) throw invalid;
    const now = new Date();
    if (row.revokedAt !== null || row.expiresAt <= now) throw invalid;

    const claimed = await root
      .update(refreshTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(refreshTokens.id, row.id),
          isNull(refreshTokens.usedAt),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now),
        ),
      )
      .returning({ id: refreshTokens.id });

    if (claimed.length === 0) {
      const [fresh] = await root
        .select({ usedAt: refreshTokens.usedAt })
        .from(refreshTokens)
        .where(eq(refreshTokens.id, row.id))
        .limit(1);
      const recentlyUsed =
        fresh?.usedAt !== null &&
        fresh !== undefined &&
        now.getTime() - fresh.usedAt.getTime() <= REFRESH_REUSE_GRACE_MS;
      if (!recentlyUsed) {
        await this.revokeFamily(root, row.familyId);
        await this.audit.record(root, {
          organizationId: row.organizationId,
          actorUserId: row.userId,
          action: "auth.refresh_reuse_detected",
          entityType: "user",
          entityId: row.userId,
          meta,
        });
      }
      throw invalid;
    }

    const context = await this.loader.load(row.userId, row.organizationId);
    if (context === null) {
      await this.revokeFamily(root, row.familyId);
      throw invalid;
    }

    const next = this.tokens.newRefreshToken();
    await root.insert(refreshTokens).values({
      userId: row.userId,
      organizationId: row.organizationId,
      familyId: row.familyId,
      tokenHash: next.hash,
      expiresAt: new Date(now.getTime() + this.tokens.refreshTtlMs),
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    const accessToken = await this.tokens.signAccess({
      userId: row.userId,
      organizationId: row.organizationId,
      sessionId: row.familyId,
    });
    let organization: SessionResult["organization"] = null;
    if (row.organizationId !== null) {
      const [org] = await root
        .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, row.organizationId))
        .limit(1);
      organization = org ?? null;
    }
    return {
      tokenType: "Bearer",
      accessToken,
      refreshToken: next.token,
      expiresIn: this.tokens.accessTtlSeconds,
      user: { id: context.userId, email: context.email, fullName: context.fullName },
      organization,
      role: context.role,
    };
  }

  /** Revoke the session a refresh token belongs to. Idempotent and silent for unknown tokens. */
  async logout(rawToken: string, meta: ClientMeta): Promise<void> {
    const root = this.database.root;
    const [row] = await root
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, this.tokens.hashRefreshToken(rawToken)))
      .limit(1);
    if (row === undefined) return;
    await this.revokeFamily(root, row.familyId);
    await this.audit.record(root, {
      organizationId: row.organizationId,
      actorUserId: row.userId,
      action: "auth.logout",
      entityType: "user",
      entityId: row.userId,
      meta,
    });
  }

  async profile(auth: AuthContext) {
    let organization: {
      id: string;
      name: string;
      slug: string;
      countryCode: string;
      defaultCurrency: string;
      timezone: string;
      locale: string;
    } | null = null;
    if (auth.organizationId !== null) {
      const orgId = auth.organizationId;
      organization =
        (await this.database.tenant(orgId, async (tx) => {
          const [row] = await tx
            .select({
              id: organizations.id,
              name: organizations.name,
              slug: organizations.slug,
              countryCode: organizations.countryCode,
              defaultCurrency: organizations.defaultCurrency,
              timezone: organizations.timezone,
              locale: organizations.locale,
            })
            .from(organizations)
            .where(eq(organizations.id, orgId))
            .limit(1);
          return row;
        })) ?? null;
    }
    return {
      user: {
        id: auth.userId,
        email: auth.email,
        fullName: auth.fullName,
        isPlatformAdmin: auth.isPlatformAdmin,
      },
      organization,
      role: auth.role,
      permissions: [...auth.permissions].sort(),
    };
  }

  private async startSession(
    executor: Executor,
    user: { id: string; email: string; fullName: string },
    organization: { id: string; name: string; slug: string } | null,
    role: MembershipRole | "super_admin",
    meta: ClientMeta,
  ): Promise<SessionResult> {
    const familyId = randomUUID();
    const refresh = this.tokens.newRefreshToken();
    await executor.insert(refreshTokens).values({
      userId: user.id,
      organizationId: organization?.id ?? null,
      familyId,
      tokenHash: refresh.hash,
      expiresAt: new Date(Date.now() + this.tokens.refreshTtlMs),
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    const accessToken = await this.tokens.signAccess({
      userId: user.id,
      organizationId: organization?.id ?? null,
      sessionId: familyId,
    });
    return {
      tokenType: "Bearer",
      accessToken,
      refreshToken: refresh.token,
      expiresIn: this.tokens.accessTtlSeconds,
      user,
      organization,
      role,
    };
  }

  private async revokeFamily(executor: Executor, familyId: string): Promise<void> {
    await executor
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }
}
