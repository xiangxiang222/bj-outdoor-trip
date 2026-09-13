import { describe, it, expect } from "vitest";
import { telHref } from "./phone";

describe("telHref", () => {
  it("builds a tel link for mainland mobiles", () => {
    expect(telHref("138 0013 8000")).toBe("tel:13800138000");
    expect(telHref("138-0013-8000")).toBe("tel:13800138000");
  });

  it("allows international numbers and rejects junk", () => {
    expect(telHref("+8613800138000")).toBe("tel:+8613800138000");
    expect(telHref("123")).toBe("");
    expect(telHref("")).toBe("");
  });
});
