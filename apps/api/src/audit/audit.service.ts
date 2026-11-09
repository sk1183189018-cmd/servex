import { Injectable } from "@nestjs/common";
import type { Executor } from "../db/database.service.js";
import { auditLogs } from "../db/schema.js";
import type { ClientMeta } from "../common/request.js";

export interface AuditEntry {
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  meta?: ClientMeta;
}

@Injectable()
export class AuditService {
  /**
   * Write an audit record on the given executor. Pass the same transaction as the change being
   * audited so the record and the change commit or roll back together. Never put passwords,
   * tokens or other secrets in metadata.
   */
  async record(executor: Executor, entry: AuditEntry): Promise<void> {
    await executor.insert(auditLogs).values({
      organizationId: entry.organizationId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
      ip: entry.meta?.ip ?? null,
      userAgent: entry.meta?.userAgent ?? null,
    });
  }
}
