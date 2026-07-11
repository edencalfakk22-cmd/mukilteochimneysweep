import { describe, it, expect } from "vitest";
import {
  shekelsToAgorot,
  agorotToShekels,
  formatILS,
  sumAgorot,
  assertAgorot,
  MoneyError,
} from "@/lib/money";

describe("shekelsToAgorot", () => {
  it("converts whole shekels", () => {
    expect(shekelsToAgorot(1500)).toBe(150_000);
    expect(shekelsToAgorot("2000")).toBe(200_000);
    expect(shekelsToAgorot(0)).toBe(0);
  });

  it("converts decimal shekels without floating point errors", () => {
    expect(shekelsToAgorot("0.1")).toBe(10);
    expect(shekelsToAgorot("0.01")).toBe(1);
    expect(shekelsToAgorot("19.99")).toBe(1999);
    expect(shekelsToAgorot("1234.5")).toBe(123_450);
  });

  it("accepts thousands separators", () => {
    expect(shekelsToAgorot("1,500")).toBe(150_000);
  });

  it("rejects invalid input", () => {
    expect(() => shekelsToAgorot("abc")).toThrow(MoneyError);
    expect(() => shekelsToAgorot("1.234")).toThrow(MoneyError);
    expect(() => shekelsToAgorot("")).toThrow(MoneyError);
    expect(() => shekelsToAgorot("1e5")).toThrow(MoneyError);
  });

  it("handles negatives (used for adjustments display only)", () => {
    expect(shekelsToAgorot("-50")).toBe(-5000);
  });
});

describe("agorotToShekels / formatILS", () => {
  it("round trips", () => {
    expect(agorotToShekels(150_000)).toBe(1500);
  });

  it("formats whole shekels without decimals", () => {
    expect(formatILS(150_000)).toMatch(/1,500/);
    expect(formatILS(150_000)).toContain("₪");
  });

  it("formats agorot fractions when present", () => {
    expect(formatILS(1999)).toMatch(/19\.99/);
  });

  it("formats negative and signed values", () => {
    expect(formatILS(-5000)).toContain("-");
    expect(formatILS(5000, { withSign: true })).toContain("+");
    expect(formatILS(0)).not.toContain("-");
  });
});

describe("sumAgorot / assertAgorot", () => {
  it("sums safely", () => {
    expect(sumAgorot([100, 200, 300])).toBe(600);
    expect(sumAgorot([])).toBe(0);
  });

  it("rejects non-integers", () => {
    expect(() => sumAgorot([1.5])).toThrow(MoneyError);
    expect(() => assertAgorot(1.5)).toThrow(MoneyError);
    expect(() => assertAgorot(-1)).toThrow(MoneyError);
    expect(assertAgorot(0)).toBe(0);
  });
});
