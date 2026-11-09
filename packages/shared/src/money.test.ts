import { describe, expect, it } from "vitest";
import {
  MoneyError,
  add,
  applyPercent,
  fromDecimal,
  gstBreakdown,
  money,
  subtract,
  sum,
  toDecimal,
  zero,
} from "./money.js";

describe("fromDecimal / toDecimal", () => {
  it("parses and prints two-decimal currencies", () => {
    const value = fromDecimal("1499.50", "INR");
    expect(value.amountMinor).toBe(149950n);
    expect(toDecimal(value)).toBe("1499.50");
  });

  it("handles zero-decimal currencies", () => {
    expect(fromDecimal("500", "JPY").amountMinor).toBe(500n);
    expect(toDecimal(money(500n, "JPY"))).toBe("500");
    expect(() => fromDecimal("500.5", "JPY")).toThrow(MoneyError);
  });

  it("handles three-decimal currencies", () => {
    expect(fromDecimal("1.234", "KWD").amountMinor).toBe(1234n);
    expect(toDecimal(money(1234n, "KWD"))).toBe("1.234");
  });

  it("handles negative and sub-unit amounts", () => {
    const value = fromDecimal("-0.05", "INR");
    expect(value.amountMinor).toBe(-5n);
    expect(toDecimal(value)).toBe("-0.05");
    expect(toDecimal(money(7n, "INR"))).toBe("0.07");
  });

  it("pads missing decimals", () => {
    expect(fromDecimal("12", "INR").amountMinor).toBe(1200n);
    expect(fromDecimal("12.5", "INR").amountMinor).toBe(1250n);
  });

  it("rejects bad input", () => {
    expect(() => fromDecimal("1.234", "INR")).toThrow(MoneyError);
    expect(() => fromDecimal("12,5", "INR")).toThrow(MoneyError);
    expect(() => fromDecimal("abc", "INR")).toThrow(MoneyError);
    expect(() => fromDecimal("", "INR")).toThrow(MoneyError);
  });

  it("rejects unsupported currencies", () => {
    expect(() => money(100n, "XXX")).toThrow(MoneyError);
  });
});

describe("arithmetic", () => {
  it("does not have floating point drift", () => {
    const total = add(fromDecimal("0.10", "INR"), fromDecimal("0.20", "INR"));
    expect(toDecimal(total)).toBe("0.30");
  });

  it("subtracts and sums", () => {
    const a = fromDecimal("100.00", "USD");
    const b = fromDecimal("40.25", "USD");
    expect(toDecimal(subtract(a, b))).toBe("59.75");
    expect(toDecimal(sum([a, b, b], "USD"))).toBe("180.50");
    expect(toDecimal(sum([], "USD"))).toBe("0.00");
  });

  it("refuses to mix currencies", () => {
    expect(() => add(zero("INR"), zero("USD"))).toThrow(MoneyError);
    expect(() => subtract(zero("INR"), zero("USD"))).toThrow(MoneyError);
  });
});

describe("applyPercent", () => {
  it("computes a simple percentage", () => {
    expect(toDecimal(applyPercent(fromDecimal("1000.00", "INR"), "18"))).toBe("180.00");
  });

  it("rounds to the nearest minor unit", () => {
    expect(toDecimal(applyPercent(fromDecimal("833.33", "INR"), "18"))).toBe("150.00");
  });

  it("rounds exact halves away from zero", () => {
    expect(applyPercent(money(5n, "INR"), "10").amountMinor).toBe(1n);
    expect(applyPercent(money(-5n, "INR"), "10").amountMinor).toBe(-1n);
  });

  it("supports fractional percentages", () => {
    expect(toDecimal(applyPercent(fromDecimal("200.00", "INR"), "2.5"))).toBe("5.00");
  });

  it("rejects invalid percentages", () => {
    expect(() => applyPercent(zero("INR"), "-5")).toThrow(MoneyError);
    expect(() => applyPercent(zero("INR"), "ten")).toThrow(MoneyError);
  });
});

describe("gstBreakdown", () => {
  const taxable = fromDecimal("1000.00", "INR");

  it("splits same-state supply into CGST and SGST", () => {
    const result = gstBreakdown(taxable, "18", true);
    expect(toDecimal(result.cgst)).toBe("90.00");
    expect(toDecimal(result.sgst)).toBe("90.00");
    expect(toDecimal(result.igst)).toBe("0.00");
    expect(toDecimal(result.total)).toBe("180.00");
  });

  it("charges IGST for different-state supply", () => {
    const result = gstBreakdown(taxable, "18", false);
    expect(toDecimal(result.igst)).toBe("180.00");
    expect(toDecimal(result.cgst)).toBe("0.00");
    expect(toDecimal(result.sgst)).toBe("0.00");
    expect(toDecimal(result.total)).toBe("180.00");
  });

  it("handles rates that halve into fractions", () => {
    const result = gstBreakdown(taxable, "5", true);
    expect(toDecimal(result.cgst)).toBe("25.00");
    expect(toDecimal(result.sgst)).toBe("25.00");
    expect(toDecimal(result.total)).toBe("50.00");
  });

  it("only accepts INR", () => {
    expect(() => gstBreakdown(fromDecimal("10.00", "USD"), "18", true)).toThrow(MoneyError);
  });
});
