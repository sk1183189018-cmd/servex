import type { Permission, Role } from "@servex/shared";

/** Who is calling and what they may do. Built on every request from the database, not the token. */
export interface AuthContext {
  userId: string;
  email: string;
  fullName: string;
  /** Null only for a platform admin session that is not acting inside a company. */
  organizationId: string | null;
  role: Role;
  isPlatformAdmin: boolean;
  permissions: ReadonlySet<Permission>;
}

/** An auth context that is guaranteed to belong to one organization. */
export interface TenantAuthContext extends AuthContext {
  organizationId: string;
}
