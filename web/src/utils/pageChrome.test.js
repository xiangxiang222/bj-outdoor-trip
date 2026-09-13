import { describe, it, expect } from "vitest";
import { chromeTitle, chromeSubtitle, setChrome, clearChrome } from "./pageChrome";

describe("page chrome", () => {
  it("sets and clears the mobile title bar", () => {
    setChrome("报名", "实名、保险与选座");
    expect(chromeTitle.value).toBe("报名");
    expect(chromeSubtitle.value).toBe("实名、保险与选座");
    clearChrome();
    expect(chromeTitle.value).toBe("");
    expect(chromeSubtitle.value).toBe("");
  });

  it("defaults both fields to empty", () => {
    setChrome();
    expect(chromeTitle.value).toBe("");
    expect(chromeSubtitle.value).toBe("");
  });
});
