import { describe, expect, it } from "vitest";
import { isDark, langLabel, nightLabel, normalize } from "./appearance";

describe("appearance", () => {
  it("keeps standard size and simplified Chinese by default", () => {
    const look = normalize({});
    expect(look.size).toBe(1);
    expect(look.night).toBe("system");
    expect(look.lang).toBe("zh");
    expect(nightLabel(look)).toBe("跟随系统");
    expect(langLabel(look)).toBe("简体中文");
  });

  it("follows the phone at night only when asked", () => {
    expect(isDark(normalize({ night: "system" }), true)).toBe(true);
    expect(isDark(normalize({ night: "system" }), false)).toBe(false);
    expect(isDark(normalize({ night: "day" }), true)).toBe(false);
    expect(isDark(normalize({ night: "dark" }), false)).toBe(true);
  });

  it("labels English and traditional Chinese", () => {
    expect(langLabel(normalize({ lang: "en" }))).toBe("English");
    expect(nightLabel(normalize({ lang: "tw", night: "dark" }))).toBe("夜間模式");
  });
});
