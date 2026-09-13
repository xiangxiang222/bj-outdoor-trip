import { describe, it, expect } from "vitest";
import { isWeChatWebView, nativeShareSupported, scheduleShareText, scheduleShareUrl } from "./share";

describe("share helpers", () => {
  it("does not use system share inside WeChat webview", () => {
    expect(isWeChatWebView("Mozilla/5.0 MicroMessenger/8.0.32")).toBe(true);
    expect(nativeShareSupported({ share: async () => {}, userAgent: "MicroMessenger/8.0" })).toBe(false);
    expect(nativeShareSupported({ share: async () => {}, userAgent: "Mozilla/5.0 Chrome/120" })).toBe(true);
    expect(nativeShareSupported({ userAgent: "Mozilla/5.0 Chrome/120" })).toBe(false);
  });

  it("builds a schedule share url with optional token", () => {
    expect(scheduleShareUrl("https://example.com/", 12, "")).toBe("https://example.com/m/schedule/12");
    expect(scheduleShareUrl("https://example.com", 12, "abc")).toBe("https://example.com/m/schedule/12?token=abc");
  });

  it("writes invite copy for the poster card", () => {
    expect(
      scheduleShareText({
        organizerName: "老周",
        title: "香山秋日",
        startDate: "2026-09-20",
        enrolled: 8,
        url: "https://example.com/m/schedule/12",
      })
    ).toBe("老周邀请你参加「香山秋日」2026-09-20出发，已有8人报名：https://example.com/m/schedule/12");
  });
});
