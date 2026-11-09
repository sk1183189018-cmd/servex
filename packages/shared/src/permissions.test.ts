import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, hasPermission } from "./permissions.js";
import { ROLES, type Role } from "./roles.js";

function rolesWith(permission: (typeof PERMISSIONS)[number]): Role[] {
  return ROLES.filter((role) => hasPermission(role, permission));
}

describe("permission catalogue", () => {
  it("has no duplicate permission keys", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("defines permissions for every role, using only known keys", () => {
    for (const role of ROLES) {
      const granted = ROLE_PERMISSIONS[role];
      expect(granted, role).toBeDefined();
      for (const permission of granted) {
        expect(PERMISSIONS, `${role} -> ${permission}`).toContain(permission);
      }
    }
  });
});

describe("default role rules", () => {
  it("keeps platform control with the super admin only", () => {
    expect(rolesWith("platform:manage")).toEqual(["super_admin"]);
  });

  it("limits subscription changes to owners and the platform", () => {
    expect(rolesWith("subscription:manage").sort()).toEqual(["company_owner", "super_admin"]);
  });

  it("limits refund approval to finance roles", () => {
    expect(rolesWith("refunds:approve").sort()).toEqual([
      "accountant",
      "company_admin",
      "company_owner",
      "super_admin",
    ]);
  });

  it("lets technicians see and update only assigned jobs", () => {
    expect(hasPermission("technician", "workorders:read_assigned")).toBe(true);
    expect(hasPermission("technician", "workorders:update_assigned")).toBe(true);
    expect(hasPermission("technician", "workorders:read")).toBe(false);
    expect(hasPermission("technician", "workorders:assign")).toBe(false);
    expect(hasPermission("technician", "refunds:approve")).toBe(false);
    expect(hasPermission("technician", "customers:read")).toBe(false);
  });

  it("keeps customers inside the portal", () => {
    expect(ROLE_PERMISSIONS.customer).toEqual(["portal:access"]);
  });

  it("keeps the auditor read-only", () => {
    for (const permission of ROLE_PERMISSIONS.auditor) {
      expect(permission, permission).toMatch(/:(read|view)$/);
    }
    expect(hasPermission("auditor", "reports:export")).toBe(false);
  });

  it("does not let dispatchers touch money or stock", () => {
    for (const permission of ["invoices:read", "payments:record", "inventory:adjust"] as const) {
      expect(hasPermission("dispatcher", permission), permission).toBe(false);
    }
  });
});
