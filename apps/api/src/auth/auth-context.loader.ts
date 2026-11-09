import { Injectable } from "@nestjs/common";
import { ROLE_PERMISSIONS, type Role } from "@servex/shared";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { DatabaseService } from "../db/database.service.js";
import { memberships, organizations, users } from "../db/schema.js";
import type { AuthContext } from "./auth-context.js";

@Injectable()
export class AuthContextLoader {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Build the caller's context from the database. Returns null when the session must no longer
   * be honoured: user disabled, membership disabled or removed, or company suspended. Looking
   * this up on every request is what makes role changes and disabling a user take effect at once.
   */
  async load(userId: string, organizationId: string | null): Promise<AuthContext | null> {
    const [row] = await this.database.root
      .select({
        email: users.email,
        fullName: users.fullName,
        userStatus: users.status,
        isPlatformAdmin: users.isPlatformAdmin,
        role: memberships.role,
        membershipStatus: memberships.status,
        organizationStatus: organizations.status,
        organizationDeletedAt: organizations.deletedAt,
      })
      .from(users)
      .leftJoin(
        memberships,
        and(
          eq(memberships.userId, users.id),
          organizationId === null ? sql`false` : eq(memberships.organizationId, organizationId),
        ),
      )
      .leftJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(eq(users.id, userId))
      .limit(1);

    if (row === undefined || row.userStatus !== "active") return null;

    if (organizationId === null) {
      if (!row.isPlatformAdmin) return null;
      const role: Role = "super_admin";
      return {
        userId,
        email: row.email,
        fullName: row.fullName,
        organizationId: null,
        role,
        isPlatformAdmin: true,
        permissions: new Set(ROLE_PERMISSIONS[role]),
      };
    }

    if (
      row.role === null ||
      row.membershipStatus !== "active" ||
      row.organizationStatus !== "active" ||
      row.organizationDeletedAt !== null
    ) {
      return null;
    }
    return {
      userId,
      email: row.email,
      fullName: row.fullName,
      organizationId,
      role: row.role,
      isPlatformAdmin: row.isPlatformAdmin,
      permissions: new Set(ROLE_PERMISSIONS[row.role]),
    };
  }
}
