import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogs, customers } from "./db/schema.js";
import {
  bearer,
  createTestContext,
  registerCompany,
  type Company,
  type TestContext,
} from "../test/helpers.js";

/**
 * The most important tests in the project: one company must never see or change another
 * company's data, through the API and directly in the database.
 */
let ctx: TestContext;
let a: Company;
let b: Company;
let aCustomerId: string;

beforeAll(async () => {
  ctx = await createTestContext();
  a = await registerCompany(ctx, "Company A");
  b = await registerCompany(ctx, "Company B");
  const made = await ctx
    .http()
    .post("/api/v1/customers")
    .set(...bearer(a.ownerToken))
    .send({ name: "Secret Customer of A", email: "secret@a.test" });
  aCustomerId = made.body.id as string;
  await ctx
    .http()
    .post("/api/v1/customers")
    .set(...bearer(b.ownerToken))
    .send({ name: "Customer of B" })
    .expect(201);
});
afterAll(async () => {
  await ctx.close();
});

describe("through the API", () => {
  it("B cannot read, change or delete A's customer (404, not 403, so existence is not leaked)", async () => {
    await ctx
      .http()
      .get(`/api/v1/customers/${aCustomerId}`)
      .set(...bearer(b.ownerToken))
      .expect(404);
    await ctx
      .http()
      .patch(`/api/v1/customers/${aCustomerId}`)
      .set(...bearer(b.ownerToken))
      .send({ name: "hacked" })
      .expect(404);
    await ctx
      .http()
      .delete(`/api/v1/customers/${aCustomerId}`)
      .set(...bearer(b.ownerToken))
      .expect(404);
    const stillThere = await ctx
      .http()
      .get(`/api/v1/customers/${aCustomerId}`)
      .set(...bearer(a.ownerToken));
    expect(stillThere.body.name).toBe("Secret Customer of A");
  });

  it("B's list and search never include A's rows", async () => {
    const all = await ctx
      .http()
      .get("/api/v1/customers")
      .set(...bearer(b.ownerToken));
    expect(JSON.stringify(all.body)).not.toContain("Secret Customer");
    const search = await ctx
      .http()
      .get("/api/v1/customers?q=Secret")
      .set(...bearer(b.ownerToken));
    expect(search.body.total).toBe(0);
  });

  it("a client-supplied organizationId is ignored", async () => {
    const res = await ctx
      .http()
      .post("/api/v1/customers")
      .set(...bearer(b.ownerToken))
      .send({ name: "Sneaky", organizationId: a.organizationId });
    expect(res.status).toBe(201);
    expect(res.body.organizationId).toBe(b.organizationId);
    const inA = await ctx
      .http()
      .get("/api/v1/customers?q=Sneaky")
      .set(...bearer(a.ownerToken));
    expect(inA.body.total).toBe(0);
  });

  it("audit logs and members are scoped to the caller's company", async () => {
    const logs = await ctx
      .http()
      .get("/api/v1/audit-logs?pageSize=100")
      .set(...bearer(b.ownerToken));
    expect(logs.body.items.length).toBeGreaterThan(0);
    for (const entry of logs.body.items) expect(entry.organizationId).toBe(b.organizationId);

    const members = await ctx
      .http()
      .get("/api/v1/members")
      .set(...bearer(b.ownerToken));
    expect(members.body.map((m: { userId: string }) => m.userId)).toEqual([b.ownerId]);
  });

  it("B cannot change A's membership by guessing its id", async () => {
    const members = await ctx
      .http()
      .get("/api/v1/members")
      .set(...bearer(a.ownerToken));
    const aMembershipId = members.body[0].id as string;
    await ctx
      .http()
      .patch(`/api/v1/members/${aMembershipId}/role`)
      .set(...bearer(b.ownerToken))
      .send({ role: "auditor" })
      .expect(404);
    await ctx
      .http()
      .patch(`/api/v1/members/${aMembershipId}/status`)
      .set(...bearer(b.ownerToken))
      .send({ status: "disabled" })
      .expect(404);
  });

  it("B's settings update only touches B", async () => {
    const res = await ctx
      .http()
      .patch("/api/v1/organizations/current")
      .set(...bearer(b.ownerToken))
      .send({ name: "Company B Renamed" });
    expect(res.status).toBe(200);
    const aOrg = await ctx
      .http()
      .get("/api/v1/organizations/current")
      .set(...bearer(a.ownerToken));
    expect(aOrg.body.name).toBe("Company A");
  });
});

describe("row-level security in the database itself", () => {
  it("a query with no WHERE clause still returns only the current company's rows", async () => {
    const rows = await ctx.db.tenant(a.organizationId, (tx) => tx.select().from(customers));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.organizationId).toBe(a.organizationId);
  });

  it("looking up another company's row by id returns nothing", async () => {
    const rows = await ctx.db.tenant(b.organizationId, (tx) =>
      tx.select().from(customers).where(eq(customers.id, aCustomerId)),
    );
    expect(rows).toEqual([]);
  });

  it("writing a row for another company is rejected by the database", async () => {
    await expect(
      ctx.db.tenant(b.organizationId, (tx) =>
        tx.insert(customers).values({ organizationId: a.organizationId, name: "Planted" }),
      ),
    ).rejects.toThrow();
  });

  it("updating or deleting another company's row affects zero rows", async () => {
    const updated = await ctx.db.tenant(b.organizationId, (tx) =>
      tx.update(customers).set({ name: "hacked" }).where(eq(customers.id, aCustomerId)).returning(),
    );
    expect(updated).toEqual([]);
    const [row] = await ctx.db.root.select().from(customers).where(eq(customers.id, aCustomerId));
    expect(row?.name).toBe("Secret Customer of A");
  });

  it("with no company set, the tenant role sees nothing (fails closed)", async () => {
    const counts = await ctx.db.root.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE servex_app`);
      const customerRows = await tx.select().from(customers);
      const auditRows = await tx.select().from(auditLogs);
      return { customers: customerRows.length, audit: auditRows.length };
    });
    expect(counts).toEqual({ customers: 0, audit: 0 });
  });

  it("the tenant role cannot read secrets from the users table", async () => {
    await expect(
      ctx.db.tenant(a.organizationId, (tx) => tx.execute(sql`SELECT password_hash FROM users`)),
    ).rejects.toThrow();
    await expect(
      ctx.db.tenant(a.organizationId, (tx) =>
        tx.execute(sql`SELECT token_hash FROM refresh_tokens`),
      ),
    ).rejects.toThrow();
  });

  it("the tenant role cannot change protected organization columns", async () => {
    await expect(
      ctx.db.tenant(a.organizationId, (tx) =>
        tx.execute(sql`UPDATE organizations SET status = 'suspended'`),
      ),
    ).rejects.toThrow();
    await expect(
      ctx.db.tenant(a.organizationId, (tx) =>
        tx.execute(sql`UPDATE organizations SET default_currency = 'USD'`),
      ),
    ).rejects.toThrow();
  });

  it("refuses a malformed organization id instead of building SQL from it", async () => {
    await expect(ctx.db.tenant("x'; DROP TABLE customers; --", async () => 1)).rejects.toThrow(
      /invalid organization id/,
    );
  });
});

describe("audit log is append-only", () => {
  it("rejects UPDATE, DELETE and TRUNCATE even for the table owner", async () => {
    const [entry] = await ctx.db.root
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, a.organizationId))
      .limit(1);
    expect(entry).toBeDefined();
    await expect(
      ctx.db.root.update(auditLogs).set({ action: "tampered" }).where(eq(auditLogs.id, entry!.id)),
    ).rejects.toThrow();
    await expect(
      ctx.db.root.delete(auditLogs).where(eq(auditLogs.id, entry!.id)),
    ).rejects.toThrow();
    await expect(ctx.db.root.execute(sql`TRUNCATE audit_logs`)).rejects.toThrow();
  });

  it("the tenant role cannot forge an entry for another company", async () => {
    await expect(
      ctx.db.tenant(b.organizationId, (tx) =>
        tx
          .insert(auditLogs)
          .values({ organizationId: a.organizationId, action: "forged", entityType: "x" }),
      ),
    ).rejects.toThrow();
  });
});
