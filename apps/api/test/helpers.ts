import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { configureApp } from "../src/app.js";
import { AppModule } from "../src/app.module.js";
import { PasswordService } from "../src/auth/password.service.js";
import { parseEnv, type Env } from "../src/config/env.js";
import { DatabaseService } from "../src/db/database.service.js";
import { memberships, users, type MembershipRole } from "../src/db/schema.js";

export const STRONG_PASSWORD = "Correct-Horse-Battery-9";
export const TEST_JWT_SECRET = "test-only-secret-that-is-at-least-32-chars-long";

export interface TestContext {
  app: NestExpressApplication;
  env: Env;
  db: DatabaseService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function createTestContext(
  overrides: Record<string, string> = {},
): Promise<TestContext> {
  const env = parseEnv({
    NODE_ENV: "test",
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_JWT_SECRET: TEST_JWT_SECRET,
    RATE_LIMIT_PER_MINUTE: "100000",
    AUTH_RATE_LIMIT_PER_MINUTE: "100000",
    ...overrides,
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env);
  await app.init();
  return {
    app,
    env,
    db: app.get(DatabaseService),
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
}

export interface Company {
  organizationId: string;
  slug: string;
  ownerEmail: string;
  ownerId: string;
  ownerToken: string;
  ownerRefresh: string;
}

export async function registerCompany(ctx: TestContext, name = "Acme Cooling"): Promise<Company> {
  const ownerEmail = uniqueEmail("owner");
  const response = await ctx.http().post("/api/v1/auth/register").send({
    organizationName: name,
    countryCode: "IN",
    fullName: "Owner Person",
    email: ownerEmail,
    password: STRONG_PASSWORD,
  });
  if (response.status !== 201) {
    throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  const body = response.body as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
    organization: { id: string; slug: string };
  };
  return {
    organizationId: body.organization.id,
    slug: body.organization.slug,
    ownerEmail,
    ownerId: body.user.id,
    ownerToken: body.accessToken,
    ownerRefresh: body.refreshToken,
  };
}

export interface Member {
  email: string;
  userId: string;
  membershipId: string;
  token: string;
}

/** Create a user with a membership directly in the database, then sign in through the API. */
export async function addMember(
  ctx: TestContext,
  company: Company,
  role: MembershipRole,
): Promise<Member> {
  const email = uniqueEmail(role.replace(/_/g, "-"));
  const passwordHash = await ctx.app.get(PasswordService).hash(STRONG_PASSWORD);
  const [user] = await ctx.db.root
    .insert(users)
    .values({ email, passwordHash, fullName: `Test ${role}` })
    .returning();
  const [membership] = await ctx.db.root
    .insert(memberships)
    .values({ organizationId: company.organizationId, userId: user!.id, role })
    .returning();
  const login = await ctx
    .http()
    .post("/api/v1/auth/login")
    .send({ email, password: STRONG_PASSWORD });
  if (login.status !== 200)
    throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  return {
    email,
    userId: user!.id,
    membershipId: membership!.id,
    token: (login.body as { accessToken: string }).accessToken,
  };
}

export const bearer = (token: string): [string, string] => ["Authorization", `Bearer ${token}`];
