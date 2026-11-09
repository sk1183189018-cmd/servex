/**
 * SERVEX database schema (PostgreSQL).
 *
 * Conventions
 * - UUID primary keys, snake_case names in the database, camelCase in code.
 * - Every tenant-owned table has organization_id and is protected by row-level security
 *   (see the tenant isolation migration). Application checks are the first line of defence,
 *   row-level security is the second.
 * - Money columns, when they arrive, use NUMERIC. Never float.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, precision: 3, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const organizationStatus = pgEnum("organization_status", ["active", "suspended"]);
export const userStatus = pgEnum("user_status", ["active", "disabled"]);
export const membershipStatus = pgEnum("membership_status", ["active", "disabled"]);

/**
 * Company-level roles. `super_admin` is deliberately absent: it is a platform flag on the user
 * (users.is_platform_admin) and a company can never hand it out.
 */
export const MEMBERSHIP_ROLES = [
  "company_owner",
  "company_admin",
  "branch_manager",
  "service_manager",
  "dispatcher",
  "technician",
  "inventory_manager",
  "accountant",
  "customer_support",
  "customer",
  "auditor",
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export const membershipRole = pgEnum("membership_role", MEMBERSHIP_ROLES);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    defaultCurrency: char("default_currency", { length: 3 }).notNull(),
    timezone: text("timezone").notNull(),
    locale: text("locale").notNull().default("en"),
    status: organizationStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    uniqueIndex("organizations_slug_key").on(t.slug),
    check("organizations_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Always stored trimmed and lower-cased; the CHECK below enforces it. */
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    locale: text("locale").notNull().default("en"),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    status: userStatus("status").notNull().default("active"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: ts("locked_until"),
    lastLoginAt: ts("last_login_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    check("users_email_normalized", sql`${t.email} = lower(btrim(${t.email}))`),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: membershipRole("role").notNull(),
    status: membershipStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("memberships_organization_user_key").on(t.organizationId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [uniqueIndex("branches_organization_code_key").on(t.organizationId, t.code)],
);

/**
 * One row per refresh token. Tokens issued from one login share a family_id so that reuse of an
 * already-rotated token can revoke the whole family.
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Organization the session acts in. Null for a platform admin session with no company. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    familyId: uuid("family_id").notNull(),
    /** SHA-256 of the token. The token itself is never stored. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    revokedAt: ts("revoked_at"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("refresh_tokens_token_hash_key").on(t.tokenHash),
    index("refresh_tokens_user_idx").on(t.userId),
    index("refresh_tokens_family_idx").on(t.familyId),
  ],
);

/** Append-only. A trigger rejects UPDATE and DELETE (see the audit guard migration). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_org_created_idx").on(t.organizationId, sql`${t.createdAt} desc`),
    index("audit_logs_org_entity_idx").on(t.organizationId, t.entityType, t.entityId),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    category: text("category"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("customers_org_name_idx").on(t.organizationId, t.name),
    index("customers_org_phone_idx").on(t.organizationId, t.phone),
    index("customers_org_email_idx").on(t.organizationId, t.email),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
