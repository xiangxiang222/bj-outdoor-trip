const { request, showError } = require("../../utils/request");
const { enrollStatusText } = require("../../utils/labels");
const { deskTrips, tripKindLabel, recruitFacts, showAfterActions, todayYmd } = require("../../utils/trips");
const app = getApp();

function decorate(item) {
  return Object.assign({}, item, {
    statusText: item.channel === "activity" && item.status === "joined" ? "已报名" : enrollStatusText(item),
    kindLabel: tripKindLabel(item),
    recruit: recruitFacts(item),
    canAfter: showAfterActions(item),
    reviewable: showAfterActions(item) && item.canReview && String(item.start_date || "").slice(0, 10) < todayYmd(),
    moneyText:
      item.channel === "activity" && Number(item.pay_amount || 0) === 0
        ? "免费"
        : item.pay_status === "unpaid" && Number(item.remainAmount || 0) > 0
          ? Number(item.paidAmount || 0) > 0
            ? "已付 ¥" + item.paidAmount + " / ¥" + (item.payAmount || item.pay_amount)
            : "待付 ¥" + (item.remainAmount || item.pay_amount)
          : "¥" + (item.payAmount || item.pay_amount),
  });
}

Page({
  data: { loggedIn: false, tab: "depart", holdTab: false, upcoming: [], restUpcoming: [], nextTrip: null, waitlist: [], past: [], all: [], unpaid: [], recruiting: [], review: [], refund: [], reviewingId: 0, rating: 5, content: "" },
  onShow() {
    const preset = app.globalData.ordersTab || "";
    if (preset) {
      app.globalData.ordersTab = "";
      this.data.tab = preset === "upcoming" ? "depart" : preset === "past" ? "all" : preset;
      this.data.holdTab = true;
    }
    if (!app.globalData.token) {
      this.setData({ loggedIn: false, upcoming: [], waitlist: [], past: [], unpaid: [], review: [], refund: [] });
      return;
    }
    this.setData({ loggedIn: true });
    this.load();
  },
  load() {
    request("/orders")
      .then((r) => {
        const list = (r.data || []).map(decorate);
        const split = deskTrips(list);
        const upcoming = split.depart;
        const waitlist = split.waitlist;
        const past = split.past;
        let tab = this.data.tab === "upcoming" ? "depart" : this.data.tab === "past" ? "all" : this.data.tab;
        if (!this.data.holdTab && tab === "depart" && !upcoming.length) {
          if (split.unpaid.length) tab = "unpaid";
          else if (split.recruiting.length) tab = "recruiting";
          else if (split.review.length) tab = "review";
          else if (waitlist.length) tab = "waitlist";
          else if (split.refund.length) tab = "refund";
          else if (list.length) tab = "all";
        }
        this.setData({
          upcoming,
          restUpcoming: upcoming.slice(1),
          nextTrip: upcoming[0] || null,
          waitlist,
          past,
          all: list,
          unpaid: split.unpaid,
          recruiting: split.recruiting,
          review: split.review,
          refund: split.refund,
          tab,
          holdTab: false,
          reviewingId: 0,
          content: "",
        });
      })
      .catch(() => this.setData({ upcoming: [], waitlist: [], past: [] }));
  },
  goLogin() {
    wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/orders/orders") });
  },
  setTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },
  goHomeTab() {
    wx.switchTab({ url: "/pages/index/index" });
  },
  goActTab() {
    wx.switchTab({ url: "/pages/activities/activities" });
  },
  goAfter(e) {
    const sid = e.currentTarget.dataset.sid;
    if (!sid) return;
    wx.navigateTo({ url: "/pages/after/after?id=" + sid });
  },
  goSchedule(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + id });
  },
  goPay(e) {
    const token = e.currentTarget.dataset.token;
    const sid = e.currentTarget.dataset.sid;
    if (token) {
      wx.navigateTo({ url: "/pages/pay/pay?token=" + token });
      return;
    }
    if (sid) wx.navigateTo({ url: "/pages/schedule/schedule?id=" + sid });
  },
  openReview(e) {
    this.setData({ reviewingId: Number(e.currentTarget.dataset.id), rating: 5, content: "" });
  },
  closeReview() {
    this.setData({ reviewingId: 0, content: "" });
  },
  pickStar(e) {
    this.setData({ rating: Number(e.currentTarget.dataset.n) });
  },
  setContent(e) {
    this.setData({ content: e.detail.value });
  },
  async submitReview(e) {
    const id = Number(e.currentTarget.dataset.id);
    const item = [].concat(this.data.upcoming, this.data.waitlist, this.data.past, this.data.all).find((row) => Number(row.id) === id);
    if (!item) return;
    try {
      await request("/reviews", "POST", {
        scheduleId: item.schedule_id,
        rating: this.data.rating,
        content: this.data.content,
      });
      wx.showToast({ title: "评价已提交", icon: "none" });
      this.load();
    } catch (err) {
      showError("评价失败", err);
    }
  },
  cancel(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const item = []
      .concat(this.data.upcoming, this.data.restUpcoming, this.data.waitlist, this.data.past, this.data.all, this.data.unpaid, this.data.recruiting, this.data.review, this.data.refund, this.data.nextTrip)
      .filter(Boolean)
      .find((row) => String(row.id) === String(id));
    const deduct = Number(item && item.deductAmount) || 0;
    const content = deduct
      ? "临近出发，取消将扣除 " + item.deductPercent + "%（¥" + deduct + "），退回 ¥" + (Number(item.refundAmount) || 0) + "。确定取消报名？名额将释放给其他人。"
      : item && item.refundHint
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
          this.load();
        } catch (err) {
          showError("取消失败", err);
        }
      },
    });
  },
});
