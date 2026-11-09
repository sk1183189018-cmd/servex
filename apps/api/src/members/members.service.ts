import { Injectable } from "@nestjs/common";
import { ROLE_PERMISSIONS } from "@servex/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { AuditService } from "../audit/audit.service.js";
import type { TenantAuthContext } from "../auth/auth-context.js";
import { Errors } from "../common/errors.js";
import type { ClientMeta } from "../common/request.js";
import { DatabaseService, type Tx } from "../db/database.service.js";
import { memberships, users, type MembershipRole } from "../db/schema.js";

@Injectable()
export class MembersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  list(auth: TenantAuthContext) {
    return this.database.tenant(auth.organizationId, (tx) =>
      tx
        .select({
          id: memberships.id,
          userId: users.id,
          email: users.email,
          fullName: users.fullName,
          role: memberships.role,
          status: memberships.status,
          createdAt: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.organizationId, auth.organizationId))
        .orderBy(asc(users.fullName), asc(memberships.id)),
    );
  }

  async changeRole(
    auth: TenantAuthContext,
    membershipId: string,
    role: MembershipRole,
    meta: ClientMeta,
  ) {
    return this.database.tenant(auth.organizationId, async (tx) => {
      const target = await this.lockTarget(tx, auth, membershipId);
      this.assertMayManage(auth, target.role);
      this.assertMayManage(auth, role);
      if (target.role === "company_owner" && role !== "company_owner") {
        await this.assertNotLastOwner(tx, auth.organizationId);
      }
      const [updated] = await tx
        .update(memberships)
        .set({ role })
        .where(
          and(
            eq(memberships.id, membershipId),
            eq(memberships.organizationId, auth.organizationId),
          ),
        )
        .returning({ id: memberships.id, role: memberships.role, status: memberships.status });
      await this.audit.record(tx, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "member.role_changed",
        entityType: "membership",
        entityId: membershipId,
        metadata: { from: target.role, to: role },
        meta,
      });
      return updated;
    });
  }

  async changeStatus(
    auth: TenantAuthContext,
    membershipId: string,
    status: "active" | "disabled",
    meta: ClientMeta,
  ) {
    return this.database.tenant(auth.organizationId, async (tx) => {
      const target = await this.lockTarget(tx, auth, membershipId);
      this.assertMayManage(auth, target.role);
      if (status === "disabled" && target.role === "company_owner" && target.status === "active") {
        await this.assertNotLastOwner(tx, auth.organizationId);
      }
      const [updated] = await tx
        .update(memberships)
        .set({ status })
        .where(
          and(
            eq(memberships.id, membershipId),
            eq(memberships.organizationId, auth.organizationId),
          ),
        )
        .returning({ id: memberships.id, role: memberships.role, status: memberships.status });
      await this.audit.record(tx, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "member.status_changed",
        entityType: "membership",
        entityId: membershipId,
        metadata: { from: target.status, to: status },
        meta,
      });
      return updated;
    });
  }

  /**
   * Serialize membership changes per company, then load and row-lock the target. Without the
   * advisory lock, two owners demoting each other at the same moment could deadlock or both
   * pass the "last owner" check.
   */
  private async lockTarget(tx: Tx, auth: TenantAuthContext, membershipId: string) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${auth.organizationId}, 0))`,
    );
    const [target] = await tx
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.id, membershipId), eq(memberships.organizationId, auth.organizationId)),
      )
      .for("update")
      .limit(1);
    if (target === undefined) throw Errors.notFound("Member");
    if (target.userId === auth.userId) {
      throw Errors.forbidden("You cannot change your own role or access");
    }
    return target;
  }

  /**
   * A caller may only touch roles whose permissions are a subset of their own. This stops a
   * company admin from promoting someone to owner or editing an owner, without hard-coding
   * role names.
   */
  private assertMayManage(auth: TenantAuthContext, role: MembershipRole): void {
    const allowed = ROLE_PERMISSIONS[role].every((permission) => auth.permissions.has(permission));
    if (!allowed) throw Errors.forbidden("You cannot manage a role with more access than your own");
  }

  private async assertNotLastOwner(tx: Tx, organizationId: string): Promise<void> {
    const owners = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.role, "company_owner"),
          eq(memberships.status, "active"),
        ),
      )
      .for("update");
    if (owners.length <= 1) {
      throw Errors.conflict("LAST_OWNER", "A company must keep at least one active owner");
    }
  }
}
