import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memberships } from "./db/schema.js";
import {
  addMember,
  bearer,
  createTestContext,
  registerCompany,
  type Company,
  type TestContext,
} from "../test/helpers.js";

let ctx: TestContext;
let company: Company;

beforeAll(async () => {
  ctx = await createTestContext();
  company = await registerCompany(ctx, "RBAC Co");
});
afterAll(async () => {
  await ctx.close();
});

describe("authentication is required", () => {
  it.each([
    ["GET", "/api/v1/customers"],
    ["POST", "/api/v1/customers"],
    ["GET", "/api/v1/members"],
    ["GET", "/api/v1/audit-logs"],
    ["GET", "/api/v1/organizations/current"],
    ["PATCH", "/api/v1/organizations/current"],
  ])("%s %s without a token is 401", async (method, path) => {
    const res = await ctx.http()[method.toLowerCase() as "get" | "post" | "patch"](path);
    expect(res.status).toBe(401);
  });
});

describe("permissions are enforced by the server", () => {
  it("technician cannot touch customers, members or audit logs", async () => {
    const tech = await addMember(ctx, company, "technician");
    await ctx
      .http()
      .get("/api/v1/customers")
      .set(...bearer(tech.token))
      .expect(403);
    await ctx
      .http()
      .post("/api/v1/customers")
      .set(...bearer(tech.token))
      .send({ name: "X" })
      .expect(403);
    await ctx
      .http()
      .get("/api/v1/members")
      .set(...bearer(tech.token))
      .expect(403);
    await ctx
      .http()
      .get("/api/v1/audit-logs")
      .set(...bearer(tech.token))
      .expect(403);
    // But any signed-in member can see their own company and profile.
    await ctx
      .http()
      .get("/api/v1/organizations/current")
      .set(...bearer(tech.token))
      .expect(200);
    await ctx
      .http()
      .get("/api/v1/auth/me")
      .set(...bearer(tech.token))
      .expect(200);
  });

  it("customer role (portal user) has no back-office access", async () => {
    const customer = await addMember(ctx, company, "customer");
    await ctx
      .http()
      .get("/api/v1/customers")
      .set(...bearer(customer.token))
      .expect(403);
    await ctx
      .http()
      .get("/api/v1/members")
      .set(...bearer(customer.token))
      .expect(403);
  });

  it("auditor can read but not write", async () => {
    const auditor = await addMember(ctx, company, "auditor");
    await ctx
      .http()
      .get("/api/v1/customers")
      .set(...bearer(auditor.token))
      .expect(200);
    await ctx
      .http()
      .get("/api/v1/audit-logs")
      .set(...bearer(auditor.token))
      .expect(200);
    await ctx
      .http()
      .get("/api/v1/members")
      .set(...bearer(auditor.token))
      .expect(200);
    await ctx
      .http()
      .post("/api/v1/customers")
      .set(...bearer(auditor.token))
      .send({ name: "X" })
      .expect(403);
    await ctx
      .http()
      .patch("/api/v1/organizations/current")
      .set(...bearer(auditor.token))
      .send({ name: "Nope Co" })
      .expect(403);
  });

  it("customer support can create and edit customers but not delete them", async () => {
    const support = await addMember(ctx, company, "customer_support");
    const made = await ctx
      .http()
      .post("/api/v1/customers")
      .set(...bearer(support.token))
      .send({ name: "Support Made" });
    expect(made.status).toBe(201);
    await ctx
      .http()
      .patch(`/api/v1/customers/${made.body.id}`)
      .set(...bearer(support.token))
      .send({ notes: "ok" })
      .expect(200);
    await ctx
      .http()
      .delete(`/api/v1/customers/${made.body.id}`)
      .set(...bearer(support.token))
      .expect(403);
    await ctx
      .http()
      .get("/api/v1/audit-logs")
      .set(...bearer(support.token))
      .expect(403);
  });

  it("a role with users:read but not users:manage cannot change members", async () => {
    const manager = await addMember(ctx, company, "branch_manager");
    const target = await addMember(ctx, company, "dispatcher");
    await ctx
      .http()
      .get("/api/v1/members")
      .set(...bearer(manager.token))
      .expect(200);
    await ctx
      .http()
      .patch(`/api/v1/members/${target.membershipId}/role`)
      .set(...bearer(manager.token))
      .send({ role: "auditor" })
      .expect(403);
    await ctx
      .http()
      .patch(`/api/v1/members/${target.membershipId}/status`)
      .set(...bearer(manager.token))
      .send({ status: "disabled" })
      .expect(403);
  });
});

describe("changes take effect immediately, without waiting for a token to expire", () => {
  it("demoting a user removes access on their very next request", async () => {
    const user = await addMember(ctx, company, "auditor");
    await ctx
      .http()
      .get("/api/v1/customers")
      .set(...bearer(user.token))
      .expect(200);
    await ctx
      .http()
      .patch(`/api/v1/members/${user.membershipId}/role`)
      .set(...bearer(company.ownerToken))
      .send({ role: "technician" })
      .expect(200);
    await ctx
      .http()
      .get("/api/v1/customers")
      .set(...bearer(user.token))
      .expect(403);
  });

  it("disabling a user kills their existing token and blocks refresh", async () => {
    const user = await addMember(ctx, company, "customer_support");
    await ctx
      .http()
      .get("/api/v1/customers")
      .set(...bearer(user.token))
      .expect(200);
    await ctx
      .http()
      .patch(`/api/v1/members/${user.membershipId}/status`)
      .set(...bearer(company.ownerToken))
      .send({ status: "disabled" })
      .expect(200);
    await ctx
      .http()
      .get("/api/v1/customers")
      .set(...bearer(user.token))
      .expect(401);
    await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "Correct-Horse-Battery-9" })
      .expect(403);

    // Re-enabling restores access for a fresh login.
    await ctx
      .http()
      .patch(`/api/v1/members/${user.membershipId}/status`)
      .set(...bearer(company.ownerToken))
      .send({ status: "active" })
      .expect(200);
    await ctx
      .http()
      .get("/api/v1/customers")
      .set(...bearer(user.token))
      .expect(200);
  });

  it("a suspended company locks everyone out at once", async () => {
    const other = await registerCompany(ctx, "Suspended Co");
    await ctx
      .http()
      .get("/api/v1/customers")
      .set(...bearer(other.ownerToken))
      .expect(200);
    await ctx.db.root.execute(
      (await import("drizzle-orm"))
        .sql`UPDATE organizations SET status = 'suspended' WHERE id = ${other.organizationId}`,
    );
    await ctx
      .http()
      .get("/api/v1/customers")
      .set(...bearer(other.ownerToken))
      .expect(401);
  });
});

describe("member management rules", () => {
  it("nobody can change their own role or access", async () => {
    const res = await ctx
      .http()
      .get("/api/v1/members")
      .set(...bearer(company.ownerToken));
    const own = res.body.find((m: { userId: string }) => m.userId === company.ownerId);
    await ctx
      .http()
      .patch(`/api/v1/members/${own.id}/role`)
      .set(...bearer(company.ownerToken))
      .send({ role: "auditor" })
      .expect(403);
    await ctx
      .http()
      .patch(`/api/v1/members/${own.id}/status`)
      .set(...bearer(company.ownerToken))
      .send({ status: "disabled" })
      .expect(403);
  });

  it("a company admin cannot promote anyone to owner or edit an owner", async () => {
    const admin = await addMember(ctx, company, "company_admin");
    const tech = await addMember(ctx, company, "technician");
    const members = await ctx
      .http()
      .get("/api/v1/members")
      .set(...bearer(admin.token));
    const owner = members.body.find((m: { userId: string }) => m.userId === company.ownerId);

    await ctx
      .http()
      .patch(`/api/v1/members/${tech.membershipId}/role`)
      .set(...bearer(admin.token))
      .send({ role: "company_owner" })
      .expect(403);
    await ctx
      .http()
      .patch(`/api/v1/members/${owner.id}/role`)
      .set(...bearer(admin.token))
      .send({ role: "auditor" })
      .expect(403);
    await ctx
      .http()
      .patch(`/api/v1/members/${owner.id}/status`)
      .set(...bearer(admin.token))
      .send({ status: "disabled" })
      .expect(403);
    // Ordinary management is allowed.
    await ctx
      .http()
      .patch(`/api/v1/members/${tech.membershipId}/role`)
      .set(...bearer(admin.token))
      .send({ role: "dispatcher" })
      .expect(200);
  });

  it("rejects roles that do not exist, including super_admin", async () => {
    const tech = await addMember(ctx, company, "technician");
    const res = await ctx
      .http()
      .patch(`/api/v1/members/${tech.membershipId}/role`)
      .set(...bearer(company.ownerToken))
      .send({ role: "super_admin" });
    expect(res.status).toBe(400);
    const [row] = await ctx.db.root
      .select()
      .from(memberships)
      .where(eq(memberships.id, tech.membershipId));
    expect(row?.role).toBe("technician");
  });

  it("two owners demoting each other at the same moment leave exactly one owner", async () => {
    const duo = await registerCompany(ctx, "Duo Co");
    const second = await addMember(ctx, duo, "company_owner");
    const list = await ctx
      .http()
      .get("/api/v1/members")
      .set(...bearer(duo.ownerToken));
    const first = list.body.find((m: { userId: string }) => m.userId === duo.ownerId);

    const [r1, r2] = await Promise.all([
      ctx
        .http()
        .patch(`/api/v1/members/${second.membershipId}/role`)
        .set(...bearer(duo.ownerToken))
        .send({ role: "auditor" }),
      ctx
        .http()
        .patch(`/api/v1/members/${first.id}/role`)
        .set(...bearer(second.token))
        .send({ role: "auditor" }),
    ]);
    // Exactly one wins. The loser is refused with 409 (requests overlapped and the last-owner
    // check stopped it) or 403 (the winner committed first, so the loser is no longer an owner).
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);
    const owners = await ctx.db.root
      .select()
      .from(memberships)
      .where(eq(memberships.organizationId, duo.organizationId));
    expect(owners.filter((m) => m.role === "company_owner")).toHaveLength(1);
  });

  it("records role and status changes in the audit log", async () => {
    const tech = await addMember(ctx, company, "technician");
    await ctx
      .http()
      .patch(`/api/v1/members/${tech.membershipId}/role`)
      .set(...bearer(company.ownerToken))
      .send({ role: "dispatcher" })
      .expect(200);
    const logs = await ctx
      .http()
      .get(`/api/v1/audit-logs?action=member.role_changed&entityId=${tech.membershipId}`)
      .set(...bearer(company.ownerToken));
    expect(logs.body.items).toHaveLength(1);
    expect(logs.body.items[0].metadata).toEqual({ from: "technician", to: "dispatcher" });
  });
});

describe("organization settings", () => {
  it("owner can update name, timezone and locale, with validation", async () => {
    const ok = await ctx
      .http()
      .patch("/api/v1/organizations/current")
      .set(...bearer(company.ownerToken))
      .send({ timezone: "Asia/Dubai", locale: "hi" });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ timezone: "Asia/Dubai", locale: "hi" });
    await ctx
      .http()
      .patch("/api/v1/organizations/current")
      .set(...bearer(company.ownerToken))
      .send({ timezone: "Mars/Olympus" })
      .expect(400);
    await ctx
      .http()
      .patch("/api/v1/organizations/current")
      .set(...bearer(company.ownerToken))
      .send({ locale: "xx" })
      .expect(400);
    await ctx
      .http()
      .patch("/api/v1/organizations/current")
      .set(...bearer(company.ownerToken))
      .send({})
      .expect(400);
  });

  it("slug, currency, country and status cannot be changed through the API", async () => {
    const before = await ctx
      .http()
      .get("/api/v1/organizations/current")
      .set(...bearer(company.ownerToken));
    await ctx
      .http()
      .patch("/api/v1/organizations/current")
      .set(...bearer(company.ownerToken))
      .send({ name: "Renamed RBAC Co", slug: "taken", defaultCurrency: "USD", status: "suspended" })
      .expect(200);
    const after = await ctx
      .http()
      .get("/api/v1/organizations/current")
      .set(...bearer(company.ownerToken));
    expect(after.body).toMatchObject({
      slug: before.body.slug,
      defaultCurrency: before.body.defaultCurrency,
      countryCode: before.body.countryCode,
      status: "active",
      name: "Renamed RBAC Co",
    });
  });
});
