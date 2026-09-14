import { describe, it, expect } from "vitest";
import { emptyCampusTarget, normalizeCampusTargets, formatCampusTarget } from "./campusTargets";

describe("campus target combinations", () => {
  it("keeps school-college-major bound and drops a major without a college", () => {
    expect(emptyCampusTarget("北京大学", "计算机学院", "软件工程")).toEqual({
      school: "北京大学",
      college: "计算机学院",
      major: "软件工程",
    });
    expect(
      normalizeCampusTargets([
        { school: "北京大学", college: "计算机学院" },
        { school: "清华大学", college: "计算机学院" },
        { school: "清华大学", college: "计算机学院" },
        { school: "首都师范大学", major: "软件工程" },
      ])
    ).toEqual([
      { school: "北京大学", college: "计算机学院", major: "" },
      { school: "清华大学", college: "计算机学院", major: "" },
      { school: "首都师范大学", college: "", major: "" },
    ]);
    expect(formatCampusTarget({ school: "北京大学", college: "计算机学院", major: "软件工程" })).toBe(
      "北京大学 · 计算机学院 · 软件工程"
    );
  });
});
