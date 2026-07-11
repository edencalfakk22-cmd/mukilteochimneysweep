/**
 * Money utilities.
 *
 * All monetary amounts in the system are stored and computed as INTEGER
 * AGOROT (1 ILS = 100 agorot). No floating point arithmetic is ever used
 * for money. The UI works in whole shekels by default and converts at the
 * boundary with these helpers.
 */

/** Throws if the value is not a safe non-negative integer amount of agorot. */
export function assertAgorot(value: number, label = "amount"): number {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be an integer amount of agorot, got ${value}`);
  }
  if (value < 0) {
    throw new MoneyError(`${label} must not be negative, got ${value}`);
  }
  return value;
}

export class MoneyError extends Error {}

/** Convert whole/decimal shekels (user input) to integer agorot, safely. */
export function shekelsToAgorot(shekels: number | string): number {
  const str = String(shekels).trim().replace(/,/g, "");
  if (str === "" || !/^-?\d+(\.\d{1,2})?$/.test(str)) {
    throw new MoneyError(`Invalid shekel amount: "${shekels}"`);
  }
  const negative = str.startsWith("-");
  const [wholeRaw, fracRaw = ""] = (negative ? str.slice(1) : str).split(".");
  const whole = Number(wholeRaw);
  const frac = Number((fracRaw + "00").slice(0, 2));
  const agorot = whole * 100 + frac;
  if (!Number.isSafeInteger(agorot)) {
    throw new MoneyError(`Amount out of range: "${shekels}"`);
  }
  return negative ? -agorot : agorot;
}

/** Convert integer agorot to shekels as a number (for display math only). */
export function agorotToShekels(agorot: number): number {
  return agorot / 100;
}

const formatterWhole = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 0,
});
const formatterFrac = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format agorot as an ILS string, e.g. 150000 -> "1,500 ₪".
 * Fractions are shown only when non-zero agorot remain.
 */
export function formatILS(agorot: number, opts?: { withSign?: boolean }): string {
  const abs = Math.abs(agorot);
  const wholeOnly = abs % 100 === 0;
  const num = wholeOnly ? formatterWhole.format(abs / 100) : formatterFrac.format(abs / 100);
  let sign = "";
  if (agorot < 0) sign = "-";
  else if (opts?.withSign && agorot > 0) sign = "+";
  return `${sign}${num} ₪`;
}

/** Sum an array of agorot integers with overflow safety. */
export function sumAgorot(values: number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new MoneyError(`Cannot sum non-integer agorot: ${v}`);
    total += v;
    if (!Number.isSafeInteger(total)) throw new MoneyError("Sum overflow");
  }
  return total;
}
