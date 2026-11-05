/**
 * Platform and company roles. These are the system defaults; companies will be able to
 * create custom roles on top of them once the backend permission store exists (Phase 2).
 */
export const ROLES = [
  "super_admin",
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

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  super_admin: "Super Admin",
  company_owner: "Company Owner",
  company_admin: "Company Admin",
  branch_manager: "Branch Manager",
  service_manager: "Service Manager",
  dispatcher: "Dispatcher",
  technician: "Technician",
  inventory_manager: "Inventory Manager",
  accountant: "Accountant",
  customer_support: "Customer Support",
  customer: "Customer",
  auditor: "Auditor",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
