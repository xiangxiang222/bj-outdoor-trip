import { describe, it, expect } from "vitest";
import { offerOf, OFFER_TYPES } from "./offer";

describe("offerOf", () => {
  it("returns the matching offer including campus-style free", () => {
    expect(offerOf("free").label).toBe("免费团");
    expect(offerOf("combo").label).toBe("组合团");
    expect(OFFER_TYPES.map((o) => o.key)).toContain("early");
  });

  it("falls back when the key is missing", () => {
    expect(offerOf("nope")).toEqual(OFFER_TYPES[3]);
    expect(offerOf("")).toEqual(OFFER_TYPES[3]);
  });
});
