import { describe, it, expect } from "vitest";
import { normalizeIdCard, parseIdCard } from "./idcard";

describe("parseIdCard", () => {
  it("normalizes spaces and lowercase x", () => {
    expect(normalizeIdCard(" 110101199205121219 ")).toBe("110101199205121219");
  });

  it("accepts a Beijing male card used by enroll", () => {
    const parsed = parseIdCard("110101199205121219");
    expect(parsed.valid).toBe(true);
    expect(parsed.gender).toBe("male");
    expect(parsed.birthday).toBe("1992-05-12");
  });

  it("rejects empty, 15-digit and bad checksum", () => {
    expect(parseIdCard("").error).toMatch(/请填写身份证号/);
    expect(parseIdCard("110101900101123").error).toMatch(/18位/);
    expect(parseIdCard("110101199205121218").error).toMatch(/校验码/);
  });

  it("rejects impossible birthdays", () => {
    expect(parseIdCard("110101199202301219").error).toMatch(/出生日期/);
  });
});
