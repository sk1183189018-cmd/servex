import { ROLES } from "@servex/shared";
import { describe, expect, it } from "vitest";
import { parseEnv } from "../config/env.js";
import { MEMBERSHIP_ROLES } from "../db/schema.js";
import { slugify } from "../auth/auth.service.js";
import { afterAll, beforeAll } from "vitest";
import { createTestContext, type TestContext } from "../../test/helpers.js";

describe("environment", () => {
  const valid = {
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    AUTH_JWT_SECRET: "x".repeat(32),
  };

  it("accepts a valid configuration and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.TRUST_PROXY).toBe(false);
  });

  it("rejects a short secret without printing it", () => {
    const secret = "short-secret-value";
    expect(() => parseEnv({ ...valid, AUTH_JWT_SECRET: secret })).toThrow(/AUTH_JWT_SECRET/);
    try {
      parseEnv({ ...valid, AUTH_JWT_SECRET: secret });
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("rejects a non-postgres database url and parses CORS origins", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
    expect(
      parseEnv({ ...valid, CORS_ORIGINS: "https://a.com, https://b.com," }).CORS_ORIGINS,
    ).toEqual(["https://a.com", "https://b.com"]);
  });
});

describe("roles stay in sync with @servex/shared", () => {
  it("database roles are every shared role except super_admin", () => {
    expect([...MEMBERSHIP_ROLES].sort()).toEqual(
      ROLES.filter((role) => role !== "super_admin").sort(),
    );
  });
});

describe("slugify", () => {
  it.each([
    ["Cool Air Services", "cool-air-services"],
    ["  AC & Fridge -- Repair!! ", "ac-fridge-repair"],
    ["शर्मा रिपेयर", "company"],
    ["Café Münster", "cafe-munster"],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("never exceeds 40 characters or ends with a dash", () => {
    const slug = slugify("a".repeat(39) + " bbbbbbbb");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("http surface", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it("health endpoints work without login", async () => {
    expect((await ctx.http().get("/api/v1/health")).body).toEqual({ status: "ok" });
    expect((await ctx.http().get("/api/v1/health/ready")).body).toEqual({ status: "ready" });
  });

  it("returns errors in one shape with a request id", async () => {
    const res = await ctx
      .http()
      .get("/api/v1/does-not-exist")
      .set("X-Request-Id", "test-request-12345");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: "NOT_FOUND", requestId: "test-request-12345" });
    expect(res.headers["x-request-id"]).toBe("test-request-12345");
  });

  it("answers malformed JSON with 400, not 500", async () => {
    const res = await ctx
      .http()
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("sets security headers and hides the framework", async () => {
    const res = await ctx.http().get("/api/v1/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
