/**
 * Money is stored as an integer count of minor units (paise, cents, fils) in a bigint.
 * No floating point is used anywhere in calculations.
 */

export const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AED: 2,
  SAR: 2,
  SGD: 2,
  AUD: 2,
  CAD: 2,
  JPY: 0,
  KWD: 3,
  BHD: 3,
};

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: string;
}

function exponentOf(currency: string): number {
  const exponent = CURRENCY_EXPONENTS[currency];
  if (exponent === undefined) {
    throw new MoneyError(`Unsupported currency: ${currency}`);
  }
  return exponent;
}

export function money(amountMinor: bigint, currency: string): Money {
  exponentOf(currency);
  return Object.freeze({ amountMinor, currency });
}

export function zero(currency: string): Money {
  return money(0n, currency);
}

/** Parse a plain decimal string such as "1499.50". Rejects more decimals than the currency allows. */
export function fromDecimal(value: string, currency: string): Money {
  const exponent = exponentOf(currency);
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) {
    throw new MoneyError(`Invalid decimal amount: ${value}`);
  }
  const negative = match[1] === "-";
  const whole = match[2] ?? "0";
  const fraction = match[3] ?? "";
  if (fraction.length > exponent) {
    throw new MoneyError(`Too many decimal places for ${currency}: ${value}`);
  }
  const minor = BigInt(whole + fraction.padEnd(exponent, "0"));
  return money(negative ? -minor : minor, currency);
}

export function toDecimal(amount: Money): string {
  const exponent = exponentOf(amount.currency);
  const negative = amount.amountMinor < 0n;
  const absolute = negative ? -amount.amountMinor : amount.amountMinor;
  const digits = absolute.toString().padStart(exponent + 1, "0");
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  const sign = negative ? "-" : "";
  return exponent > 0 ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function sum(values: readonly Money[], currency: string): Money {
  return values.reduce((total, value) => add(total, value), zero(currency));
}

interface ParsedPercent {
  readonly value: bigint;
  readonly scale: number;
}

function parsePercent(percent: string): ParsedPercent {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(percent.trim());
  if (!match) {
    throw new MoneyError(`Invalid percentage: ${percent}`);
  }
  const whole = match[1] ?? "0";
  const fraction = match[2] ?? "";
  return { value: BigInt(whole + fraction), scale: fraction.length };
}

/** Integer division that rounds half away from zero. The divisor must be positive. */
function divideRoundHalfUp(numerator: bigint, divisor: bigint): bigint {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / divisor;
  const remainder = absolute % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function applyParsedPercent(amount: Money, percent: ParsedPercent): Money {
  const numerator = amount.amountMinor * percent.value;
  const divisor = 100n * 10n ** BigInt(percent.scale);
  return money(divideRoundHalfUp(numerator, divisor), amount.currency);
}

/** Percentage of an amount, rounded to the nearest minor unit (half away from zero). */
export function applyPercent(amount: Money, percent: string): Money {
  return applyParsedPercent(amount, parsePercent(percent));
}

export interface GstBreakdown {
  readonly cgst: Money;
  readonly sgst: Money;
  readonly igst: Money;
  readonly total: Money;
}

/**
 * GST split for INR amounts. Same-state supply is split into equal CGST and SGST halves of the
 * rate, each rounded on its own, which is how invoice lines are normally shown. Different-state
 * supply is charged as IGST at the full rate.
 *
 * This is a calculation helper only. Rates, place-of-supply rules and rounding policy need
 * review by a qualified tax professional before real invoicing.
 */
export function gstBreakdown(taxable: Money, rate: string, intraState: boolean): GstBreakdown {
  if (taxable.currency !== "INR") {
    throw new MoneyError("GST applies to INR amounts only");
  }
  const parsed = parsePercent(rate);
  const none = zero("INR");
  if (intraState) {
    const half: ParsedPercent = { value: parsed.value * 5n, scale: parsed.scale + 1 };
    const cgst = applyParsedPercent(taxable, half);
    const sgst = applyParsedPercent(taxable, half);
    return { cgst, sgst, igst: none, total: add(cgst, sgst) };
  }
  const igst = applyParsedPercent(taxable, parsed);
  return { cgst: none, sgst: none, igst, total: igst };
}
