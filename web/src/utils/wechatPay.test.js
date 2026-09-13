import { describe, it, expect } from "vitest";
import { liveWechatPay, MINIPROGRAM_PAY_HINT } from "./wechatPay";

describe("liveWechatPay", () => {
  it("is false for mock or completed pay", () => {
    expect(liveWechatPay(null)).toBe(false);
    expect(liveWechatPay({ needPay: false, wechatPay: { mock: false } })).toBe(false);
    expect(liveWechatPay({ needPay: true, wechatPay: { mock: true } })).toBe(false);
  });

  it("is true when the server returns a real JSAPI package", () => {
    expect(liveWechatPay({ needPay: true, wechatPay: { mock: false, paySign: "x" } })).toBe(true);
    expect(MINIPROGRAM_PAY_HINT).toMatch(/小程序/);
  });
});
