const { request, showError } = require("../../utils/request");
const { deskTrips, showAfterActions, todayYmd } = require("../../utils/trips");
const { orderBadge, orderMoney, orderShop, orderSpec, canReorder, orderTimePresets, matchOrderTime, matchOrderQuery } = require("../../utils/order-view");
const app = getApp();

function decorate(item) {
  const badge = orderBadge(item);
  return Object.assign({}, item, {
    badge: badge.label,
    hot: badge.key === "unpaid" || badge.key === "refund",
    shop: orderShop(item),
    spec: orderSpec(item),
    moneyText: orderMoney(item),
    reviewable: showAfterActions(item) && item.canReview && String(item.start_date || "").slice(0, 10) < todayYmd(),
    again: canReorder(item),
    helperCount: (item.helpers || []).length,
  });
}

Page({
  data: {
    loggedIn: false,
    tab: "depart",
    keyword: "",
    list: [],
    shown: [],
    emptyAll: false,
    sheet: false,
    moreYears: false,
    quick: [],
    years: [],
    extra: [],
    draftPreset: "",
    draftStart: "",
    draftEnd: "",
    preset: "",
    start: "",
    end: "",
    filterOn: false,
  },
  onShow() {
    const preset = app.globalData.ordersTab || "";
    if (preset) {
      app.globalData.ordersTab = "";
      this.data.tab = preset === "upcoming" ? "depart" : preset === "past" ? "all" : preset;
      this.data.holdTab = true;
    }
    const time = orderTimePresets();
    this.setData({ quick: time.quick, years: time.years, extra: time.extra });
    if (!app.globalData.token) {
      this.setData({ loggedIn: false, list: [], shown: [] });
      return;
    }
    this.setData({ loggedIn: true });
    this.load();
  },
  load() {
    request("/orders")
      .then((r) => {
        const list = (r.data || []).map(decorate);
        let tab = this.data.tab === "upcoming" ? "depart" : this.data.tab === "past" ? "all" : this.data.tab;
        if (!this.data.holdTab && tab === "depart") {
          const split = deskTrips(list);
          if (!split.depart.length) {
            if (split.unpaid.length) tab = "unpaid";
            else if (split.recruiting.length) tab = "recruiting";
            else if (split.review.length) tab = "review";
            else if (split.waitlist.length) tab = "waitlist";
            else if (split.refund.length) tab = "refund";
            else tab = "all";
          }
        }
        this.data.list = list;
        this.data.tab = tab;
        this.data.holdTab = false;
        this.paint();
      })
      .catch(() => this.setData({ list: [], shown: [], emptyAll: true }));
  },
  paint() {
    const split = deskTrips(this.data.list);
    const tab = this.data.tab;
    const pool =
      tab === "unpaid" ? split.unpaid
      : tab === "recruiting" ? split.recruiting
      : tab === "depart" ? split.depart
      : tab === "review" ? split.review
      : tab === "waitlist" ? split.waitlist
      : tab === "refund" ? split.refund
      : this.data.list;
    const filter = { preset: this.data.preset, start: this.data.start, end: this.data.end };
    const shown = pool.filter((row) => matchOrderTime(row, filter) && matchOrderQuery(row, this.data.keyword));
    this.setData({
      tab,
      list: this.data.list,
      shown,
      emptyAll: !this.data.list.length,
      filterOn: Boolean(this.data.preset || this.data.start || this.data.end),
    });
  },
  goLogin() {
    wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/orders/orders") });
  },
  setTab(e) {
    this.data.tab = e.currentTarget.dataset.tab;
    this.data.holdTab = true;
    this.paint();
  },
  setKeyword(e) {
    this.data.keyword = e.detail.value || "";
    this.paint();
  },
  openFilter() {
    this.setData({
      sheet: true,
      draftPreset: this.data.preset,
      draftStart: this.data.start,
      draftEnd: this.data.end,
      moreYears: (this.data.extra || []).some((item) => item.key === this.data.preset),
    });
  },
  closeFilter() {
    this.setData({ sheet: false });
  },
  noop() {},
  pickPreset(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ draftPreset: this.data.draftPreset === key ? "" : key, draftStart: "", draftEnd: "" });
  },
  showYears() {
    this.setData({ moreYears: true });
  },
  setStart(e) {
    this.setData({ draftStart: e.detail.value, draftPreset: "" });
  },
  setEnd(e) {
    this.setData({ draftEnd: e.detail.value, draftPreset: "" });
  },
  resetDraft() {
    this.setData({ draftPreset: "", draftStart: "", draftEnd: "" });
  },
  applyFilter() {
    this.data.preset = this.data.draftPreset;
    this.data.start = this.data.draftStart;
    this.data.end = this.data.draftEnd;
    this.setData({ sheet: false });
    this.paint();
  },
  goHomeTab() {
    wx.switchTab({ url: "/pages/index/index" });
  },
  goActTab() {
    wx.switchTab({ url: "/pages/activities/activities" });
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const review = e.currentTarget.dataset.review ? "&review=1" : "";
    wx.navigateTo({ url: "/pages/enroll-order/enroll-order?id=" + id + review });
  },
  goAfter(e) {
    const sid = e.currentTarget.dataset.sid;
    if (!sid) return;
    wx.navigateTo({ url: "/pages/after/after?id=" + sid });
  },
  goPay(e) {
    const token = e.currentTarget.dataset.token;
    const id = e.currentTarget.dataset.id;
    if (token) {
      wx.navigateTo({ url: "/pages/pay/pay?token=" + token });
      return;
    }
    if (id) wx.navigateTo({ url: "/pages/enroll-order/enroll-order?id=" + id });
  },
  goRoute(e) {
    const id = e.currentTarget.dataset.rid;
    if (!id) return;
    wx.navigateTo({ url: "/pkg-detail/detail/detail?id=" + id });
  },
  cancel(e) {
    const id = e.currentTarget.dataset.id;
    const item = (this.data.list || []).find((row) => String(row.id) === String(id));
    if (!item) return;
    const deduct = Number(item.deductAmount) || 0;
    const content = deduct
      ? "临近出发，取消将扣除 " + item.deductPercent + "%（¥" + deduct + "），退回 ¥" + (Number(item.refundAmount) || 0) + "。确定取消报名？名额将释放给其他人。"
      : item.refundHint
        ? "确定取消报名？" + item.refundHint + "。名额将释放给其他人。已付款按付款人原路退回。"
        : "确定取消报名？名额将释放给其他人。已付款按付款人原路退回。";
    wx.showModal({
      title: deduct ? "取消将扣费" : "取消报名",
      content,
      confirmColor: "#bc4749",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await request("/orders/" + id + "/cancel", "POST");
          wx.showToast({ title: "已取消报名", icon: "none" });
          this.data.holdTab = true;
          this.load();
        } catch (err) {
          showError("取消失败", err);
        }
      },
    });
  },
});
