import { Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { AuditService } from "../audit/audit.service.js";
import type { TenantAuthContext } from "../auth/auth-context.js";
import { Errors, first } from "../common/errors.js";
import type { ClientMeta } from "../common/request.js";
import type { Page } from "../common/zod-pipe.js";
import { DatabaseService } from "../db/database.service.js";
import { customers, type Customer } from "../db/schema.js";
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "./customers.schemas.js";

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Never returns soft-deleted rows; they stay in the database for history but are invisible here. */
@Injectable()
export class CustomersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  list(auth: TenantAuthContext, query: ListCustomersQuery): Promise<Page<Customer>> {
    return this.database.tenant(auth.organizationId, async (tx) => {
      const conditions: SQL[] = [
        eq(customers.organizationId, auth.organizationId),
        isNull(customers.deletedAt),
      ];
      if (query.q !== undefined && query.q !== "") {
        const pattern = `%${escapeLike(query.q)}%`;
        const search = or(
          ilike(customers.name, pattern),
          ilike(customers.email, pattern),
          ilike(customers.phone, pattern),
        );
        if (search !== undefined) conditions.push(search);
      }
      const where = and(...conditions);
      const column = query.sort === "createdAt" ? customers.createdAt : customers.name;
      const direction = query.order === "desc" ? desc : asc;

      const [totals] = await tx.select({ value: count() }).from(customers).where(where);
      const items = await tx
        .select()
        .from(customers)
        .where(where)
        .orderBy(direction(column), asc(customers.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);

      return { items, page: query.page, pageSize: query.pageSize, total: totals?.value ?? 0 };
    });
  }

  get(auth: TenantAuthContext, id: string): Promise<Customer> {
    return this.database.tenant(auth.organizationId, async (tx) => {
      const [row] = await tx
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.id, id),
            eq(customers.organizationId, auth.organizationId),
            isNull(customers.deletedAt),
          ),
        )
        .limit(1);
      if (row === undefined) throw Errors.notFound("Customer");
      return row;
    });
  }

  create(auth: TenantAuthContext, input: CreateCustomerInput, meta: ClientMeta): Promise<Customer> {
    return this.database.tenant(auth.organizationId, async (tx) => {
      const row = first(
        await tx
          .insert(customers)
          .values({
            organizationId: auth.organizationId,
            name: input.name,
            email: input.email ?? null,
            phone: input.phone ?? null,
            category: input.category ?? null,
            notes: input.notes ?? null,
          })
          .returning(),
        "customer",
      );
      await this.audit.record(tx, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "customer.created",
        entityType: "customer",
        entityId: row.id,
        meta,
      });
      return row;
    });
  }

  update(
    auth: TenantAuthContext,
    id: string,
    input: UpdateCustomerInput,
    meta: ClientMeta,
  ): Promise<Customer> {
    return this.database.tenant(auth.organizationId, async (tx) => {
      const [row] = await tx
        .update(customers)
        .set(input)
        .where(
          and(
            eq(customers.id, id),
            eq(customers.organizationId, auth.organizationId),
            isNull(customers.deletedAt),
          ),
        )
        .returning();
      if (row === undefined) throw Errors.notFound("Customer");
      await this.audit.record(tx, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "customer.updated",
        entityType: "customer",
        entityId: id,
        // Field names only. Values can be personal data and do not belong in a log.
        metadata: { fields: Object.keys(input) },
        meta,
      });
      return row;
    });
  }

  async remove(auth: TenantAuthContext, id: string, meta: ClientMeta): Promise<void> {
    await this.database.tenant(auth.organizationId, async (tx) => {
      const [row] = await tx
        .update(customers)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(customers.id, id),
            eq(customers.organizationId, auth.organizationId),
            isNull(customers.deletedAt),
          ),
        )
        .returning({ id: customers.id });
      if (row === undefined) throw Errors.notFound("Customer");
      await this.audit.record(tx, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "customer.deleted",
        entityType: "customer",
        entityId: id,
        meta,
      });
    });
  }
}
