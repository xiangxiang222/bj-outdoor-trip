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
    const appearance = require("./utils/appearance");
    appearance.applyChrome(appearance.read());
    if (wx.onThemeChange) {
      wx.onThemeChange(() => appearance.applyChrome(appearance.read()));
    }
  },
  onShow(options) {
    const app = liveApp(this);
    if (!app) return;
    const extra = options && options.referrerInfo && options.referrerInfo.extraData;
    if (options && options.scene === 1038 && extra && extra.code) {
      app.globalData.realnameCode = String(extra.code);
    }
    promptUnusedCoupons();
  },
});

function liveApp(fallback) {
  let app = null;
  try {
    app = typeof getApp === "function" ? getApp() : null;
  } catch (e) {
    app = null;
  }
  if (app && app.globalData) return app;
  if (fallback && fallback.globalData) return fallback;
  return null;
}

function promptUnusedCoupons() {
  const app = liveApp();
  if (!app || app.globalData.couponPrompted || !app.globalData.token) return;
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  const route = pages.length ? pages[pages.length - 1].route : "";
  if (route === "pages/coupons/coupons" || route === "pages/coupon/coupon") return;
  const { request } = require("./utils/request");
  const { unusedCoupons, couponCountdown } = require("./utils/coupon-time");
  request("/me/coupons")
    .then((res) => {
      const live = liveApp();
      if (!live) return;
      const rows = unusedCoupons(res.data || []);
      live.globalData.couponPrompted = true;
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
}

const appearance = require("./utils/appearance");
const locale = require("./utils/locale");
const NAV_TITLES = {
  "pages/index/index": "同行者众",
  "pages/activities/activities": "同城局",
  "pages/orders/orders": "行程",
  "pages/mine/mine": "我的",
  "pages/official/official": "客服与规则",
  "pages/settings/settings": "设置",
  "pages/look-font/look-font": "字体字号设置",
  "pages/look-night/look-night": "夜间模式",
  "pages/look-lang/look-lang": "多语言与翻译",
  "pages/profile/profile": "实名信息",
  "pages/wallet/wallet": "我的钱包",
  "pages/wallet-cards/wallet-cards": "提现说明",
  "pages/wallet-pin/wallet-pin": "支付密码",
  "pages/rules/rules": "规则",
  "pages/feedback/feedback": "意见反馈",
  "pages/lottery/lottery": "活动",
  "pages/after/after": "完成活动",
  "pages/routes/routes": "线路",
  "pages/chain/chain": "拼团",
  "pages/schedule/schedule": "活动报名",
  "pages/enroll/enroll": "报名",
  "pages/pay/pay": "付团费",
  "pages/order-detail/order-detail": "订单详情",
  "pages/coupon/coupon": "优惠券",
  "pages/coupons/coupons": "我的优惠券",
  "pages/open/open": "发布排期",
  "pages/login/login": "登录",
  "pages/member/member": "会员中心",
  "pages/favorites/favorites": "我的收藏",
  "pages/notices/notices": "消息",
  "pages/views/views": "最近看过",
  "pages/companions/companions": "常用报名人",
  "pages/follows/follows": "关注领队",
  "pages/stats/stats": "本团画像",
  "pages/guides/guides": "领队导游",
  "pages/guide/guide": "导游详情",
  "pages/user/user": "个人主页",
  "pages/publish/publish": "发团",
  "pages/leader/leader": "领队申请",
  "pages/route-apply/route-apply": "申请收录线路",
  "pages/student/student": "校园认证",
  "pages/campus-pick/campus-pick": "选择",
  "pkg-detail/detail/detail": "线路详情",
};

function speak(text) {
  return locale.translate(text, appearance.read().lang);
}

function shortButton(text) {
  const next = speak(text);
  return Array.from(next).length <= 4 ? next : text;
}

let navSet = false;
const rawTitle = wx.setNavigationBarTitle;
wx.setNavigationBarTitle = function (opt) {
  navSet = true;
  const next = Object.assign({}, opt || {});
  if (next.title) next.title = speak(next.title);
  return rawTitle.call(wx, next);
};
const rawToast = wx.showToast;
wx.showToast = function (opt) {
  const next = Object.assign({}, opt || {});
  if (next.title) next.title = speak(next.title);
  return rawToast.call(wx, next);
};
const rawModal = wx.showModal;
wx.showModal = function (opt) {
  const next = Object.assign({}, opt || {});
  if (next.title) next.title = speak(next.title);
  if (next.content) next.content = speak(next.content);
  if (next.confirmText) next.confirmText = shortButton(next.confirmText);
  if (next.cancelText) next.cancelText = shortButton(next.cancelText);
  return rawModal.call(wx, next);
};
const rawSheet = wx.showActionSheet;
wx.showActionSheet = function (opt) {
  const next = Object.assign({}, opt || {});
  if (next.alertText) next.alertText = speak(next.alertText);
  if (next.itemList) next.itemList = next.itemList.map((item) => speak(item));
  return rawSheet.call(wx, next);
};

const originPage = Page;
Page = function (config) {
  const look = appearance.read();
  config.data = Object.assign({ lookRoot: "16px", lookStyle: "", lang: look.lang }, config.data || {});
  const originLoad = config.onLoad;
  const originShow = config.onShow;
  config.onLoad = function (query) {
    appearance.paint(this);
    if (originLoad) originLoad.call(this, query);
  };
  config.onShow = function () {
    navSet = false;
    appearance.paint(this);
    if (originShow) originShow.call(this);
    if (!navSet && NAV_TITLES[this.route]) wx.setNavigationBarTitle({ title: NAV_TITLES[this.route] });
  };
  return originPage(config);
};
