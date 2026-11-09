import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memberships, refreshTokens, users } from "../db/schema.js";
import {
  STRONG_PASSWORD,
  TEST_JWT_SECRET,
  bearer,
  createTestContext,
  registerCompany,
  uniqueEmail,
  type TestContext,
} from "../../test/helpers.js";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

const registerBody = (overrides: Record<string, unknown> = {}) => ({
  organizationName: "Cool Air Services",
  countryCode: "IN",
  fullName: "Asha Patel",
  email: uniqueEmail("asha"),
  password: STRONG_PASSWORD,
  ...overrides,
});

describe("register", () => {
  it("creates the company, an owner and a session, and never returns the password hash", async () => {
    const res = await ctx.http().post("/api/v1/auth/register").send(registerBody());
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.role).toBe("company_owner");
    // The test database is reused between runs, so the slug may carry a collision suffix.
    expect(res.body.organization.slug).toMatch(/^cool-air-services(-[0-9a-f]{4})?$/);
    expect(JSON.stringify(res.body)).not.toMatch(/password|\$argon2/i);

    const me = await ctx
      .http()
      .get("/api/v1/auth/me")
      .set(...bearer(res.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.organization).toMatchObject({
      defaultCurrency: "INR",
      timezone: "Asia/Kolkata",
      countryCode: "IN",
    });
    expect(me.body.permissions).toContain("customers:write");
    expect(me.body.permissions).not.toContain("platform:manage");
  });

  it("stores the password as an argon2id hash, not plain text", async () => {
    const body = registerBody();
    await ctx.http().post("/api/v1/auth/register").send(body).expect(201);
    const [row] = await ctx.db.root.select().from(users).where(eq(users.email, body.email));
    expect(row?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(row?.passwordHash).not.toContain(STRONG_PASSWORD);
  });

  it("gives two companies with the same name different addresses", async () => {
    const a = await ctx
      .http()
      .post("/api/v1/auth/register")
      .send(registerBody({ organizationName: "Twin Repairs" }));
    const b = await ctx
      .http()
      .post("/api/v1/auth/register")
      .send(registerBody({ organizationName: "Twin Repairs" }));
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.organization.slug).not.toBe(b.body.organization.slug);
  });

  it("rejects a duplicate email with a clear code", async () => {
    const body = registerBody();
    await ctx.http().post("/api/v1/auth/register").send(body).expect(201);
    const again = await ctx
      .http()
      .post("/api/v1/auth/register")
      .send(registerBody({ email: body.email }));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("EMAIL_TAKEN");
  });

  it.each([
    ["too short", "Short1!"],
    ["repetitive", "aaaaaaaaaaaaaaaa"],
    ["contains the email name", "mypassword-asha-2024"],
  ])("rejects a weak password (%s)", async (_label, password) => {
    const res = await ctx
      .http()
      .post("/api/v1/auth/register")
      .send(registerBody({ email: "asha@example.test", password }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects bad input with field-level details", async () => {
    const res = await ctx
      .http()
      .post("/api/v1/auth/register")
      .send(registerBody({ email: "not-an-email", countryCode: "India" }));
    expect(res.status).toBe(400);
    const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["email", "countryCode"]));
  });

  it("needs a currency for countries without a default, and rejects unsupported ones", async () => {
    const missing = await ctx
      .http()
      .post("/api/v1/auth/register")
      .send(registerBody({ countryCode: "ZZ" }));
    expect(missing.status).toBe(400);
    const unsupported = await ctx
      .http()
      .post("/api/v1/auth/register")
      .send(registerBody({ countryCode: "ZZ", currency: "XXX" }));
    expect(unsupported.status).toBe(400);
    const ok = await ctx
      .http()
      .post("/api/v1/auth/register")
      .send(registerBody({ countryCode: "ZZ", currency: "USD" }));
    expect(ok.status).toBe(201);
  });

  it("does not trust a role or organization sent by the client", async () => {
    const res = await ctx
      .http()
      .post("/api/v1/auth/register")
      .send(registerBody({ role: "super_admin", isPlatformAdmin: true }));
    expect(res.status).toBe(201);
    const [row] = await ctx.db.root.select().from(users).where(eq(users.id, res.body.user.id));
    expect(row?.isPlatformAdmin).toBe(false);
    expect(res.body.role).toBe("company_owner");
  });
});

describe("login", () => {
  it("signs in with the right password", async () => {
    const company = await registerCompany(ctx);
    const res = await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ email: company.ownerEmail, password: STRONG_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.organization.id).toBe(company.organizationId);
  });

  it("treats the email case-insensitively", async () => {
    const company = await registerCompany(ctx);
    const res = await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ email: company.ownerEmail.toUpperCase(), password: STRONG_PASSWORD });
    expect(res.status).toBe(200);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const company = await registerCompany(ctx);
    const wrong = await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ email: company.ownerEmail, password: "wrong-password-123" });
    const unknown = await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ email: uniqueEmail("nobody"), password: "wrong-password-123" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.body.error.code).toBe(unknown.body.error.code);
  });

  it("locks the account after 5 wrong passwords, even for the right one", async () => {
    const company = await registerCompany(ctx);
    for (let i = 0; i < 5; i += 1) {
      await ctx
        .http()
        .post("/api/v1/auth/login")
        .send({ email: company.ownerEmail, password: "wrong-password-123" })
        .expect(401);
    }
    const locked = await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ email: company.ownerEmail, password: STRONG_PASSWORD });
    expect(locked.status).toBe(401);

    // Once the lock window passes, the right password works again.
    await ctx.db.root
      .update(users)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(users.id, company.ownerId));
    await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ email: company.ownerEmail, password: STRONG_PASSWORD })
      .expect(200);
  });

  it("refuses a disabled user", async () => {
    const company = await registerCompany(ctx);
    await ctx.db.root
      .update(users)
      .set({ status: "disabled" })
      .where(eq(users.id, company.ownerId));
    const res = await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ email: company.ownerEmail, password: STRONG_PASSWORD });
    expect(res.status).toBe(403);
  });

  it("asks which company when a user belongs to several, and honours the choice", async () => {
    const first = await registerCompany(ctx, "First Co");
    const second = await registerCompany(ctx, "Second Co");
    await ctx.db.root
      .insert(memberships)
      .values({ organizationId: second.organizationId, userId: first.ownerId, role: "technician" });

    const ambiguous = await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ email: first.ownerEmail, password: STRONG_PASSWORD });
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.error.code).toBe("ORGANIZATION_SELECTION_REQUIRED");
    expect(ambiguous.body.error.details.organizations).toHaveLength(2);

    const chosen = await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ email: first.ownerEmail, password: STRONG_PASSWORD, organizationSlug: second.slug });
    expect(chosen.status).toBe(200);
    expect(chosen.body.organization.id).toBe(second.organizationId);
    expect(chosen.body.role).toBe("technician");

    const stranger = await registerCompany(ctx, "Stranger Co");
    const denied = await ctx.http().post("/api/v1/auth/login").send({
      email: first.ownerEmail,
      password: STRONG_PASSWORD,
      organizationSlug: stranger.slug,
    });
    expect(denied.status).toBe(403);
  });
});

describe("access tokens", () => {
  it("rejects missing, malformed, wrongly signed and expired tokens", async () => {
    const company = await registerCompany(ctx);
    await ctx.http().get("/api/v1/auth/me").expect(401);
    await ctx
      .http()
      .get("/api/v1/auth/me")
      .set(...bearer("garbage"))
      .expect(401);

    const claims = { org: company.organizationId, sid: randomUUID() };
    const options = { subject: company.ownerId, issuer: "servex", audience: "servex-api" };
    const jwt = ctx.app.get(JwtService);
    const forged = await jwt.signAsync(claims, {
      ...options,
      secret: "another-secret-that-is-long-enough-123456",
      expiresIn: 600,
    });
    await ctx
      .http()
      .get("/api/v1/auth/me")
      .set(...bearer(forged))
      .expect(401);
    const expired = await jwt.signAsync(claims, {
      ...options,
      secret: TEST_JWT_SECRET,
      expiresIn: -10,
    });
    await ctx
      .http()
      .get("/api/v1/auth/me")
      .set(...bearer(expired))
      .expect(401);
    const wrongAudience = await jwt.signAsync(claims, {
      ...options,
      audience: "someone-else",
      secret: TEST_JWT_SECRET,
      expiresIn: 600,
    });
    await ctx
      .http()
      .get("/api/v1/auth/me")
      .set(...bearer(wrongAudience))
      .expect(401);
    const valid = await jwt.signAsync(claims, {
      ...options,
      secret: TEST_JWT_SECRET,
      expiresIn: 600,
    });
    await ctx
      .http()
      .get("/api/v1/auth/me")
      .set(...bearer(valid))
      .expect(200);
  });

  it("rejects an unsigned (alg none) token", async () => {
    const company = await registerCompany(ctx);
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({
      sub: company.ownerId,
      org: company.organizationId,
      sid: randomUUID(),
      iss: "servex",
      aud: "servex-api",
      exp: Math.floor(Date.now() / 1000) + 600,
    })}.`;
    await ctx
      .http()
      .get("/api/v1/auth/me")
      .set(...bearer(token))
      .expect(401);
  });
});

describe("refresh tokens", () => {
  it("rotates: the new token works and the old one is single-use", async () => {
    const company = await registerCompany(ctx);
    const first = await ctx
      .http()
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: company.ownerRefresh });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(company.ownerRefresh);
    expect(first.body.organization.id).toBe(company.organizationId);
    await ctx
      .http()
      .get("/api/v1/auth/me")
      .set(...bearer(first.body.accessToken))
      .expect(200);

    // Immediate replay looks like a double submit: refused, but the new token survives.
    await ctx
      .http()
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: company.ownerRefresh })
      .expect(401);
    await ctx
      .http()
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: first.body.refreshToken })
      .expect(200);
  });

  it("treats a replay after the grace window as theft and revokes the whole family", async () => {
    const company = await registerCompany(ctx);
    const first = await ctx
      .http()
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: company.ownerRefresh });
    expect(first.status).toBe(200);

    await ctx.db.root
      .update(refreshTokens)
      .set({ usedAt: new Date(Date.now() - 60_000) })
      .where(eq(refreshTokens.userId, company.ownerId));
    await ctx
      .http()
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: company.ownerRefresh })
      .expect(401);
    // The legitimate newer token is dead too, because the family was revoked.
    await ctx
      .http()
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: first.body.refreshToken })
      .expect(401);
  });

  it("stores only a hash of the token", async () => {
    const company = await registerCompany(ctx);
    const rows = await ctx.db.root
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, company.ownerId));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.tokenHash).not.toBe(company.ownerRefresh);
  });

  it("refuses to refresh once the user is disabled", async () => {
    const company = await registerCompany(ctx);
    await ctx.db.root
      .update(users)
      .set({ status: "disabled" })
      .where(eq(users.id, company.ownerId));
    await ctx
      .http()
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: company.ownerRefresh })
      .expect(401);
  });

  it("logout revokes the session and is safe to repeat", async () => {
    const company = await registerCompany(ctx);
    await ctx
      .http()
      .post("/api/v1/auth/logout")
      .send({ refreshToken: company.ownerRefresh })
      .expect(204);
    await ctx
      .http()
      .post("/api/v1/auth/logout")
      .send({ refreshToken: company.ownerRefresh })
      .expect(204);
    await ctx
      .http()
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: company.ownerRefresh })
      .expect(401);
    await ctx
      .http()
      .post("/api/v1/auth/logout")
      .send({ refreshToken: "x".repeat(43) })
      .expect(204);
  });
});

describe("rate limiting", () => {
  it("limits the auth endpoints", async () => {
    const limited = await createTestContext({ AUTH_RATE_LIMIT_PER_MINUTE: "3" });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const res = await limited
          .http()
          .post("/api/v1/auth/login")
          .send({ email: uniqueEmail("rl"), password: "wrong-password-123" });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
      expect(statuses.slice(3)).toEqual([429, 429]);
    } finally {
      await limited.close();
    }
  });
});
