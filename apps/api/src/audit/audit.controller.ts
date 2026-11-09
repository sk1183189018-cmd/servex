import { Controller, Get, Query } from "@nestjs/common";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { TenantAuthContext } from "../auth/auth-context.js";
import { CurrentTenant, RequirePermissions } from "../auth/auth.decorators.js";
import { pageQuery, ZodValidationPipe } from "../common/zod-pipe.js";
import { DatabaseService } from "../db/database.service.js";
import { auditLogs } from "../db/schema.js";

const listAuditSchema = z.object({
  ...pageQuery,
  entityType: z.string().trim().min(1).max(60).optional(),
  entityId: z.string().trim().min(1).max(80).optional(),
  action: z.string().trim().min(1).max(80).optional(),
});
type ListAuditQuery = z.output<typeof listAuditSchema>;

@Controller("audit-logs")
export class AuditController {
  constructor(private readonly database: DatabaseService) {}

  @RequirePermissions("audit:read")
  @Get()
  list(
    @CurrentTenant() auth: TenantAuthContext,
    @Query(new ZodValidationPipe(listAuditSchema)) query: ListAuditQuery,
  ) {
    return this.database.tenant(auth.organizationId, async (tx) => {
      const conditions: SQL[] = [eq(auditLogs.organizationId, auth.organizationId)];
      if (query.entityType !== undefined)
        conditions.push(eq(auditLogs.entityType, query.entityType));
      if (query.entityId !== undefined) conditions.push(eq(auditLogs.entityId, query.entityId));
      if (query.action !== undefined) conditions.push(eq(auditLogs.action, query.action));
      const where = and(...conditions);

      const [totals] = await tx.select({ value: count() }).from(auditLogs).where(where);
      const items = await tx
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      return { items, page: query.page, pageSize: query.pageSize, total: totals?.value ?? 0 };
    });
  }
}
