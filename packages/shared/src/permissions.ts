import type { Role } from "./roles";

/**
 * Permission keys use the form `resource:action`.
 *
 * IMPORTANT: this file only describes the defaults. The backend must enforce permissions
 * on every request. Hiding a button in the UI is never a security control.
 */
export const PERMISSIONS = [
  "platform:manage",
  "subscription:manage",
  "settings:manage",
  "users:read",
  "users:manage",
  "roles:manage",
  "audit:read",

  "customers:read",
  "customers:write",
  "customers:delete",

  "workorders:read",
  "workorders:read_assigned",
  "workorders:create",
  "workorders:update",
  "workorders:update_assigned",
  "workorders:assign",
  "workorders:cancel",

  "technicians:read",
  "technicians:manage",
  "dispatch:view",
  "dispatch:manage",

  "inventory:read",
  "inventory:manage",
  "inventory:adjust",
  "purchasing:read",
  "purchasing:manage",

  "invoices:read",
  "invoices:create",
  "invoices:void",
  "payments:record",
  "refunds:approve",
  "expenses:manage",

  "contracts:read",
  "contracts:manage",

  "reports:view",
  "reports:export",

  "portal:access",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const TENANT_ALL = PERMISSIONS.filter((p) => p !== "platform:manage");

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  super_admin: PERMISSIONS,
  company_owner: TENANT_ALL,
  company_admin: TENANT_ALL.filter((p) => p !== "subscription:manage"),
  branch_manager: [
    "users:read",
    "customers:read",
    "customers:write",
    "workorders:read",
    "workorders:create",
    "workorders:update",
    "workorders:assign",
    "workorders:cancel",
    "technicians:read",
    "technicians:manage",
    "dispatch:view",
    "dispatch:manage",
    "inventory:read",
    "purchasing:read",
    "invoices:read",
    "contracts:read",
    "reports:view",
  ],
  service_manager: [
    "customers:read",
    "customers:write",
    "workorders:read",
    "workorders:create",
    "workorders:update",
    "workorders:assign",
    "workorders:cancel",
    "technicians:read",
    "dispatch:view",
    "inventory:read",
    "invoices:read",
    "contracts:read",
    "reports:view",
  ],
  dispatcher: [
    "customers:read",
    "workorders:read",
    "workorders:assign",
    "technicians:read",
    "dispatch:view",
    "dispatch:manage",
  ],
  technician: ["workorders:read_assigned", "workorders:update_assigned", "inventory:read"],
  inventory_manager: [
    "inventory:read",
    "inventory:manage",
    "inventory:adjust",
    "purchasing:read",
    "purchasing:manage",
    "reports:view",
  ],
  accountant: [
    "customers:read",
    "workorders:read",
    "invoices:read",
    "invoices:create",
    "invoices:void",
    "payments:record",
    "refunds:approve",
    "expenses:manage",
    "reports:view",
    "reports:export",
  ],
  customer_support: [
    "customers:read",
    "customers:write",
    "workorders:read",
    "workorders:create",
    "workorders:update",
    "invoices:read",
    "contracts:read",
  ],
  customer: ["portal:access"],
  auditor: [
    "users:read",
    "audit:read",
    "customers:read",
    "workorders:read",
    "technicians:read",
    "dispatch:view",
    "inventory:read",
    "purchasing:read",
    "invoices:read",
    "contracts:read",
    "reports:view",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
