const { baseUrl } = require("./config");

App({
  globalData: {
    baseUrl,
    token: "",
    user: null,
    routeFilter: null,
    homeView: "",
    couponPrompted: false,
  },
  onLaunch() {
    this.globalData.token = wx.getStorageSync("bj_token") || "";
    this.globalData.user = wx.getStorageSync("bj_user") || null;
    this.globalData.couponPrompted = false;
  },
  onShow() {
    this.maybePromptUnusedCoupons();
  },
  maybePromptUnusedCoupons() {
    if (this.globalData.couponPrompted) return;
    if (!this.globalData.token) return;
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    const route = pages.length ? pages[pages.length - 1].route : "";
    if (route === "pages/coupons/coupons" || route === "pages/coupon/coupon") return;
    const { request } = require("./utils/request");
    const { unusedCoupons, couponCountdown } = require("./utils/coupon-time");
    request("/me/coupons")
      .then((res) => {
        const rows = unusedCoupons(res.data || []);
        this.globalData.couponPrompted = true;
        if (!rows.length) return;
        const first = rows[0];
        const clock = couponCountdown(first);
        const extra = clock && !clock.expired ? clock.label : "";
        wx.showModal({
          title: "有未使用的优惠券",
          content:
            rows.length === 1
              ? "「" + (first.name || first.label) + "」还没用" + (extra ? "，" + extra : "") + "。"
              : "你有 " + rows.length + " 张未使用优惠券" + (extra ? "，最近一张" + extra : "") + "。",
          confirmText: "去看看",
          cancelText: "稍后",
          success(r) {
            if (r.confirm) wx.navigateTo({ url: "/pages/coupons/coupons" });
          },
        });
      })
      .catch(() => {});
  },
});
