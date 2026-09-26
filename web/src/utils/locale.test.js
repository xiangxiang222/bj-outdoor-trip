import { describe, expect, it } from "vitest";
import { translate } from "./locale";

describe("locale", () => {
  it("leaves simplified Chinese unchanged", () => {
    expect(translate("首页", "zh")).toBe("首页");
    expect(translate("首页", "")).toBe("首页");
  });

  it("translates interface copy and keeps unknown names", () => {
    expect(translate("首页", "en")).toBe("Home");
    expect(translate(" 我的钱包 ", "en")).toBe(" Wallet ");
    expect(translate("3团", "en")).toBe("3 trips");
    expect(translate("还缺2人", "en")).toBe("2 seats left");
    expect(translate("会员 ¥12", "en")).toBe("Member ¥12");
    expect(translate("慕田峪长城", "en")).toBe("慕田峪长城");
    expect(translate("余 30 座", "en")).toBe("30 seats left");
    expect(translate("9/25 周五 07:30 · 怀柔", "en")).toBe("9/25 Fri 07:30 · Huairou");
    expect(translate("同行者众 · 东直门东方银座C口", "en")).toBe("同行者众 · Dongzhimen Oriental Ginza, exit C");
    expect(translate("3 天前", "en")).toBe("3 days ago");
    expect(translate("出发前 10 天及以上：退 100%。", "en")).toBe("10+ days before departure: 100% refund.");
    expect(translate("出发前不足 3 天就走", "en")).toBe("出发前不足 3 天就走");
    expect(translate("30人中巴", "en")).toBe("30-seat minibus");
  });

  it("converts every character into traditional Chinese", () => {
    expect(translate("字体字号设置", "tw")).toBe("字體字號設置");
    expect(translate("首页和活动", "tw")).toBe("首頁和活動");
    expect(translate("发布排期", "tw")).toBe("發佈排期");
  });
});
