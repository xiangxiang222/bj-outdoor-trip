import { describe, it, expect } from "vitest";
import {
  starText,
  genderText,
  insuranceText,
  enrollStatusText,
  payStatusText,
  organizerTypeText,
  scheduleStatusText,
} from "./labels";

describe("labels", () => {
  it("clamps star ratings to five glyphs", () => {
    expect(starText(3)).toBe("★★★☆☆");
    expect(starText(9)).toBe("★★★★★");
    expect(starText(-1)).toBe("☆☆☆☆☆");
    expect(starText("x")).toBe("☆☆☆☆☆");
  });

  it("maps gender and insurance codes", () => {
    expect(genderText("male")).toBe("男");
    expect(genderText("female")).toBe("女");
    expect(genderText("other")).toBe("未填");
    expect(genderText("")).toBe("");
    expect(insuranceText("plus")).toBe("升级高额险");
    expect(insuranceText("outdoor")).toBe("户外意外险");
    expect(insuranceText("none")).toBe("未加购");
  });

  it("labels enroll and pay states including oversub pending", () => {
    expect(enrollStatusText({ status: "cancelled", pay_status: "refunded" })).toBe("已取消 · 已退款");
    expect(enrollStatusText({ status: "cancelled", pay_status: "paid" })).toBe("已取消");
    expect(enrollStatusText({ status: "waitlist" })).toBe("候补中");
    expect(enrollStatusText({ status: "applied" })).toBe("已报名待确认");
    expect(enrollStatusText({ status: "joined", pay_status: "company_pending" })).toBe("公司挂账");
    expect(payStatusText("paid")).toBe("已支付");
    expect(payStatusText("unknown")).toBe("unknown");
    expect(payStatusText("")).toBe("");
  });

  it("shortens organizer type and schedule status", () => {
    expect(organizerTypeText("company")).toBe("公司团");
    expect(organizerTypeText("campus", true)).toBe("高校");
    expect(organizerTypeText("individual")).toBe("个人拼团");
    expect(scheduleStatusText("recruiting")).toBe("招募中");
    expect(scheduleStatusText("cancelled")).toBe("已解散");
    expect(scheduleStatusText("custom")).toBe("custom");
  });
});
