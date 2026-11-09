import { describe, expect, it } from "vitest";
import { ROLES, ROLE_LABELS, isRole } from "./roles.js";

describe("roles", () => {
  it("has the twelve roles from the product spec", () => {
    expect(ROLES).toHaveLength(12);
  });

  it("has a label for every role", () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role], role).toBeTruthy();
    }
  });

  it("recognises valid roles only", () => {
    expect(isRole("technician")).toBe(true);
    expect(isRole("root")).toBe(false);
    expect(isRole(42)).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
