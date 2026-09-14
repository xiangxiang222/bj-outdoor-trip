import { describe, it, expect } from "vitest";
import { isWeChatWebView, nativeShareSupported, scheduleShareText, scheduleShareUrl, payShareUrl, payShareText } from "./share";

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
    expect(scheduleShareUrl("https://example.com", 12, "abc", "长城口令")).toBe(
      "https://example.com/m/schedule/12?token=abc&joinCode=%E9%95%BF%E5%9F%8E%E5%8F%A3%E4%BB%A4"
    );
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
    expect(
      scheduleShareText({
        organizerName: "老周",
        title: "香山秋日",
        startDate: "2026-09-20",
        enrolled: 8,
        url: "https://example.com/m/schedule/12",
        joinCode: "长城口令",
      })
    ).toBe("老周邀请你参加「香山秋日」2026-09-20出发，已有8人报名：https://example.com/m/schedule/12 入团口令 长城口令");
  });

  it("builds a pay share link and copy", () => {
    expect(payShareUrl("https://example.com/", "abC12")).toBe("https://example.com/m/pay/abC12");
    expect(
      payShareText({
        travelerName: "林*",
        title: "慕田峪",
        remainAmount: 80,
        url: "https://example.com/m/pay/abC12",
      })
    ).toBe("林*的「慕田峪」团费还差 ¥80，可代付全款或分摊一部分：https://example.com/m/pay/abC12");
  });
});
