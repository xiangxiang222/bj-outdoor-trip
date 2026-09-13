import { describe, it, expect } from "vitest";
import { roleLabel, capsOf, hasCap } from "./staff";

describe("staff roles", () => {
  it("labels known roles and defaults unknown to super admin copy", () => {
    expect(roleLabel("operator")).toBe("运营");
    expect(roleLabel("leader")).toBe("领队");
    expect(roleLabel("photographer")).toBe("摄影");
    expect(roleLabel("nope")).toBe("超级管理员");
  });

  it("gives admin every cap and photographer only roster and photo", () => {
    expect(capsOf("admin")).toEqual(["staff", "ops", "field", "roster", "photo"]);
    expect(capsOf("operator")).toEqual(["ops", "field", "roster", "photo"]);
    expect(capsOf("leader")).toEqual(["field", "roster", "photo"]);
    expect(capsOf("photographer")).toEqual(["roster", "photo"]);
    expect(capsOf("guest")).toEqual([]);
  });

  it("prefers explicit caps on the session over the role map", () => {
    expect(hasCap({ role: "photographer" }, "ops")).toBe(false);
    expect(hasCap({ role: "photographer", caps: ["ops"] }, "ops")).toBe(true);
    expect(hasCap({ role: "admin" }, "staff")).toBe(true);
  });
});
