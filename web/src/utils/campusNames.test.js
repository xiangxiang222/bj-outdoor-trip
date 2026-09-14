import { describe, it, expect } from "vitest";
import { splitCampusNames, joinCampusNames, campusPickLabel, hasCampusNames } from "./campusNames";

describe("campus name helpers", () => {
  it("splits comma lists and joins with a Chinese comma", () => {
    expect(splitCampusNames("北京大学,清华大学")).toEqual(["北京大学", "清华大学"]);
    expect(splitCampusNames("北京大学，清华大学；北京林业大学")).toEqual(["北京大学", "清华大学", "北京林业大学"]);
    expect(joinCampusNames(["北京大学", "清华大学", "北京大学"])).toBe("北京大学，清华大学");
  });

  it("renders a compact picker label", () => {
    expect(campusPickLabel("", "可选，从名单里选")).toBe("可选，从名单里选");
    expect(campusPickLabel("北京大学，清华大学")).toBe("北京大学、清华大学");
  });

  it("tells whether any campus name is selected", () => {
    expect(hasCampusNames("")).toBe(false);
    expect(hasCampusNames("首都师范大学，北京大学")).toBe(true);
  });
});
