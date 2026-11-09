import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bearer,
  createTestContext,
  registerCompany,
  type Company,
  type TestContext,
} from "../../test/helpers.js";

let ctx: TestContext;
let company: Company;
const auth = () => bearer(company.ownerToken);

beforeAll(async () => {
  ctx = await createTestContext();
  company = await registerCompany(ctx);
});
afterAll(async () => {
  await ctx.close();
});

const create = (body: Record<string, unknown>) =>
  ctx
    .http()
    .post("/api/v1/customers")
    .set(...auth())
    .send(body);

describe("customers CRUD", () => {
  it("creates, reads, updates and soft-deletes a customer", async () => {
    const created = await create({
      name: "  Ravi Kumar ",
      email: "  RAVI@Example.COM ",
      phone: "+91 98765 43210",
      category: "Residential",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "Ravi Kumar",
      email: "ravi@example.com",
      phone: "+91 98765 43210",
      organizationId: company.organizationId,
      deletedAt: null,
    });
    const id = created.body.id as string;

    const read = await ctx
      .http()
      .get(`/api/v1/customers/${id}`)
      .set(...auth());
    expect(read.status).toBe(200);
    expect(read.body.name).toBe("Ravi Kumar");

    const updated = await ctx
      .http()
      .patch(`/api/v1/customers/${id}`)
      .set(...auth())
      .send({ notes: "Prefers morning visits", email: null });
    expect(updated.status).toBe(200);
    expect(updated.body.notes).toBe("Prefers morning visits");
    expect(updated.body.email).toBeNull();
    expect(updated.body.name).toBe("Ravi Kumar");

    await ctx
      .http()
      .delete(`/api/v1/customers/${id}`)
      .set(...auth())
      .expect(204);
    await ctx
      .http()
      .get(`/api/v1/customers/${id}`)
      .set(...auth())
      .expect(404);
    await ctx
      .http()
      .patch(`/api/v1/customers/${id}`)
      .set(...auth())
      .send({ name: "x" })
      .expect(404);
    await ctx
      .http()
      .delete(`/api/v1/customers/${id}`)
      .set(...auth())
      .expect(404);
  });

  it("turns empty strings into null and ignores fields it does not know", async () => {
    const res = await create({
      name: "Meena",
      email: "",
      phone: "",
      notes: "",
      organizationId: "00000000-0000-4000-8000-000000000000",
      deletedAt: "2020-01-01",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: null,
      phone: null,
      notes: null,
      organizationId: company.organizationId,
      deletedAt: null,
    });
  });

  it("validates input", async () => {
    expect((await create({})).status).toBe(400);
    expect((await create({ name: "A", email: "nope" })).status).toBe(400);
    expect((await create({ name: "A", phone: "abc" })).status).toBe(400);
    expect((await create({ name: "x".repeat(201) })).status).toBe(400);
    const made = await create({ name: "Valid" });
    const id = made.body.id as string;
    expect(
      (
        await ctx
          .http()
          .patch(`/api/v1/customers/${id}`)
          .set(...auth())
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await ctx
          .http()
          .patch(`/api/v1/customers/${id}`)
          .set(...auth())
          .send({ name: "" })
      ).status,
    ).toBe(400);
    expect(
      (
        await ctx
          .http()
          .get("/api/v1/customers/not-a-uuid")
          .set(...auth())
      ).status,
    ).toBe(400);
  });
});

describe("customers list", () => {
  let listCompany: Company;
  beforeAll(async () => {
    listCompany = await registerCompany(ctx, "List Co");
    const names = [
      "Anil",
      "Bhavna",
      "Chirag",
      "Divya",
      "Esha",
      "Farhan",
      "100% Cool",
      "Under_score",
    ];
    for (const name of names) {
      await ctx
        .http()
        .post("/api/v1/customers")
        .set(...bearer(listCompany.ownerToken))
        .send({
          name,
          email: `${name.toLowerCase().replace(/\W/g, "")}@example.test`,
          phone: "+91 90000 0000" + names.indexOf(name),
        });
    }
  });
  const list = (query: string) =>
    ctx
      .http()
      .get(`/api/v1/customers${query}`)
      .set(...bearer(listCompany.ownerToken));

  it("paginates with a stable order and an accurate total", async () => {
    const page1 = await list("?pageSize=3&page=1");
    const page2 = await list("?pageSize=3&page=2");
    const page3 = await list("?pageSize=3&page=3");
    expect(page1.body.total).toBe(8);
    expect(page1.body.items.map((c: { name: string }) => c.name)).toEqual([
      "100% Cool",
      "Anil",
      "Bhavna",
    ]);
    const all = [...page1.body.items, ...page2.body.items, ...page3.body.items].map(
      (c: { id: string }) => c.id,
    );
    expect(new Set(all).size).toBe(8);
    expect(page3.body.items).toHaveLength(2);
  });

  it("sorts in both directions", async () => {
    const desc = await list("?sort=name&order=desc&pageSize=2");
    expect(desc.body.items.map((c: { name: string }) => c.name)).toEqual(["Under_score", "Farhan"]);
  });

  it("searches name, email and phone case-insensitively", async () => {
    expect((await list("?q=BHAV")).body.items).toHaveLength(1);
    expect((await list("?q=divya@example")).body.items).toHaveLength(1);
    expect((await list("?q=90000 0000")).body.total).toBe(8);
  });

  it("treats % and _ in a search as plain characters", async () => {
    expect((await list("?q=%25")).body.items.map((c: { name: string }) => c.name)).toEqual([
      "100% Cool",
    ]);
    expect((await list("?q=_")).body.items.map((c: { name: string }) => c.name)).toEqual([
      "Under_score",
    ]);
  });

  it("caps the page size and rejects nonsense", async () => {
    expect((await list("?pageSize=1000")).status).toBe(400);
    expect((await list("?page=0")).status).toBe(400);
    expect((await list("?sort=password")).status).toBe(400);
  });
});

describe("customer audit trail", () => {
  it("records who did what, with field names but not values", async () => {
    const made = await create({ name: "Audited Person", phone: "+91 99999 11111" });
    const id = made.body.id as string;
    await ctx
      .http()
      .patch(`/api/v1/customers/${id}`)
      .set(...auth())
      .send({ phone: "+91 88888 22222" })
      .expect(200);
    await ctx
      .http()
      .delete(`/api/v1/customers/${id}`)
      .set(...auth())
      .expect(204);

    const logs = await ctx
      .http()
      .get(`/api/v1/audit-logs?entityType=customer&entityId=${id}`)
      .set(...auth());
    expect(logs.status).toBe(200);
    expect(logs.body.items.map((l: { action: string }) => l.action).sort()).toEqual([
      "customer.created",
      "customer.deleted",
      "customer.updated",
    ]);
    for (const entry of logs.body.items) expect(entry.actorUserId).toBe(company.ownerId);
    const updated = logs.body.items.find(
      (l: { action: string }) => l.action === "customer.updated",
    );
    expect(updated.metadata).toEqual({ fields: ["phone"] });
    expect(JSON.stringify(logs.body)).not.toContain("88888");
  });
});
