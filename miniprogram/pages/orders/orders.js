const { request, showError } = require("../../utils/request");
const { deskTrips, isReviewTrip, isEndedTrip, normalizeTripTab, tripEndDay } = require("../../utils/trips");
const { orderBadge, orderHint, orderMoney, orderShop, orderSpec, canReorder, orderTimePresets, matchOrderTime, matchOrderQuery } = require("../../utils/order-view");
const { isDark } = require("../../utils/appearance");
const app = getApp();
const STATUS_TABS = [{key:"all",label:"全部"},{key:"depart",label:"待出发"},{key:"unpaid",label:"待付款"},{key:"review",label:"待评价"},{key:"ended",label:"已结束"},{key:"recruiting",label:"招募中"},{key:"waitlist",label:"候补中"},{key:"refund",label:"已退款"}];
const PRIMARY_KEYS = ["all","depart","unpaid","review","ended"];

function decorate(item) {
  const badge = orderBadge(item);
  return Object.assign({}, item, {
    badge: badge.label,
    hot: badge.key === "unpaid",
    shop: orderShop(item),
    spec: orderSpec(item),
    moneyText: orderMoney(item),
    cardCopy: ["refund", "recruiting", "overdue"].includes(badge.key) ? orderHint(item) : item.channel === "activity" ? "同城相遇，一起赴约" : "走进山野，和同频的人同行",
    reviewable: isReviewTrip(item),
    ended: isEndedTrip(item),
    travelDate: (() => { const start = String(item.start_date || item.startDate || "").slice(0,10); const end = tripEndDay(item); return start ? start.replace(/-/g,".") + (end && end !== start ? " — " + end.replace(/-/g,".") : "") : "日期待确认"; })(),
    travelTime: item.meetup_time || item.meetupTime || "时间待确认",
    travelPlace: item.meetup_point || item.meetupPoint || item.city || "集合地点待确认",
    paymentLabel: item.pay_status === "unpaid" ? "待支付" : item.pay_status === "company_pending" ? "公司统一支付" : Number(item.payAmount != null ? item.payAmount : item.pay_amount || 0) === 0 ? "参与费用" : "报名费用",
    again: canReorder(item),
    helperCount: (item.helpers || []).length,
  });
}

Page({
  data: {
    loggedIn: false,
    tab: "depart",
    tabInto: "",
    keyword: "",
    list: [],
    shown: [],
    emptyAll: false,
    loading: true,
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
    statusTabs: STATUS_TABS.slice(0,5),
    allStatusTabs: STATUS_TABS,
    summary: [{key:"depart",label:"待出发",count:0},{key:"unpaid",label:"待付款",count:0},{key:"ended",label:"已结束",count:0}],
    selectedStatus: "待出发",
    ready: false,
    loadError: false,
    filterError: "",
    draftTab: "",
    extraStatus: false,
    dark: false,
    cancelling: 0,
  },
  onLoad(query) {
    const tab = normalizeTripTab(query && query.tab);
    if (tab) { this.data.tab = tab; this._selectedTab = true; }
  },
  onUnload() { this._unloaded = true; },
  onShow() {
    this._unloaded = false;
    this.setData({ dark: isDark() });
    const preset = app.globalData.ordersTab || "";
    if (preset) {
      app.globalData.ordersTab = "";
      this.data.tab = normalizeTripTab(preset) || "all";
      this._selectedTab = true;
    }
    const time = orderTimePresets();
    this.setData({ quick: time.quick, years: time.years, extra: time.extra });
    if (!app.globalData.token) {
      this.setData({ loggedIn: false, list: [], shown: [], loading: false });
      return;
    }
    this.setData({ loggedIn: true });
    this.load();
  },
  load() {
    if (this._pendingLoad) return this._pendingLoad;
    this.setData({ loading:true, loadError:false });
    this._pendingLoad = request("/orders").then((response) => {
      if (this._unloaded) return;
      if (!Array.isArray(response.data)) throw new Error("Invalid orders");
      const list = response.data.map(decorate);
      let tab = normalizeTripTab(this.data.tab) || "all";
      if (!this.data.ready && !this._selectedTab) {
        const split = deskTrips(list);
        tab = ["depart","unpaid","recruiting","review","waitlist","refund"].find((key) => split[key].length) || "all";
      }
      this.setData({ list, tab, ready:true });
      this.paint();
    }).catch(() => { if (!this._unloaded) this.setData({ loadError:true }); })
      .finally(() => { if (!this._unloaded) this.setData({ loading:false }); this._pendingLoad = null; });
    return this._pendingLoad;
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
      : tab === "ended" ? split.ended
      : this.data.list;
    const filter = { preset: this.data.preset, start: this.data.start, end: this.data.end };
    const shown = pool.filter((row) => matchOrderTime(row, filter) && matchOrderQuery(row, this.data.keyword));
    this.setData({
      tab,
      tabInto: "tab-" + tab,
      list: this.data.list,
      shown,
      emptyAll: !this.data.list.length,
      statusTabs: STATUS_TABS.filter((item) => PRIMARY_KEYS.includes(item.key) || item.key === tab).map((item) => Object.assign({},item,{count:item.key === "all" ? this.data.list.length : split[item.key].length})),
      summary: [{key:"depart",label:"待出发",count:split.depart.length},{key:"unpaid",label:"待付款",count:split.unpaid.length},{key:"ended",label:"已结束",count:split.ended.length}],
      selectedStatus: (STATUS_TABS.find((item) => item.key === tab) || STATUS_TABS[0]).label,
      extraStatus: !PRIMARY_KEYS.includes(tab),
      filterOn: Boolean(this.data.preset || this.data.start || this.data.end),
    });
  },
  goLogin() {
    wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/orders/orders") });
  },
  setTab(e) {
    const tab = normalizeTripTab(e.currentTarget.dataset.tab || e.currentTarget.dataset.key);
    if (!tab) return;
    this.data.tab = tab;
    this._selectedTab = true;
    this.paint();
  },
  setKeyword(e) {
    this.data.keyword = e.detail.value || "";
    this.paint();
  },
  openFilter() {
    this.setData({
      sheet: true,
      filterError: "",
      draftTab: this.data.tab,
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
    this.setData({ draftTab:"all", filterError:"", draftPreset: "", draftStart: "", draftEnd: "" });
  },
  applyFilter() {
    if (this.data.draftStart && this.data.draftEnd && this.data.draftStart > this.data.draftEnd) { this.setData({filterError:"起始时间不能晚于终止时间"}); return; }
    this.data.tab = normalizeTripTab(this.data.draftTab) || "all";
    this._selectedTab = true;
    this.data.preset = this.data.draftPreset;
    this.data.start = this.data.draftStart;
    this.data.end = this.data.draftEnd;
    this.setData({ sheet: false, filterError:"" });
    this.paint();
  },
  setDraftTab(e) { this.setData({draftTab:e.currentTarget.dataset.key}); },
  clearFilters() { this.setData({keyword:"",preset:"",start:"",end:"",tab:"all"}); this._selectedTab = true; this.paint(); },
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
    if (this.data.cancelling) return;
    const id = e.currentTarget.dataset.id;
    const item = (this.data.list || []).find((row) => String(row.id) === String(id));
    if (!item) return;
    const deduct = Number(item.deductAmount) || 0;
    const content = deduct
      ? "临近出发，取消将扣除 " + item.deductPercent + "%（¥" + deduct + "），退回 ¥" + (Number(item.refundAmount) || 0) + "。确定取消报名？名额将释放给其他人。"
      : item.refundHint
        ? "确定取消报名？" + item.refundHint + "。名额将释放给其他人。已付款按付款人原路退回。"
        : "确定取消报名？名额将释放给其他人。已付款按付款人原路退回。";
    this.setData({cancelling:id});
    wx.showModal({
      title: deduct ? "取消将扣费" : "取消报名",
      content,
      confirmColor: "#5b3b8c",
      success: async (res) => {
        if (!res.confirm) { this.setData({cancelling:0}); return; }
        try {
          await request("/orders/" + id + "/cancel", "POST");
          wx.showToast({ title: "已取消报名", icon: "none" });
          this._selectedTab = true;
          await this.load();
        } catch (err) {
          showError("取消失败", err);
        } finally { this.setData({cancelling:0}); }
      },
      fail: () => this.setData({cancelling:0}),
    });
  },
});
