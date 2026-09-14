const { request, showError } = require("../../utils/request");
const { enrollStatusText } = require("../../utils/labels");
const { splitTrips, tripKindLabel } = require("../../utils/trips");
const app = getApp();

function decorate(item) {
  return Object.assign({}, item, {
    statusText: item.channel === "activity" && item.status === "joined" ? "已报名" : enrollStatusText(item),
    kindLabel: tripKindLabel(item),
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
  data: { loggedIn: false, tab: "upcoming", upcoming: [], restUpcoming: [], nextTrip: null, waitlist: [], past: [], reviewingId: 0, rating: 5, content: "" },
  onShow() {
    if (!app.globalData.token) {
      this.setData({ loggedIn: false, upcoming: [], waitlist: [], past: [] });
      return;
    }
    this.setData({ loggedIn: true });
    this.load();
  },
  load() {
    request("/orders")
      .then((r) => {
        const list = (r.data || []).map(decorate);
        const split = splitTrips(list);
        const upcoming = split.upcoming;
        const waitlist = split.waitlist;
        const past = split.past;
        let tab = this.data.tab;
        if (tab === "upcoming" && !upcoming.length && waitlist.length) tab = "waitlist";
        else if (tab === "upcoming" && !upcoming.length && !waitlist.length && past.length) tab = "past";
        this.setData({
          upcoming,
          restUpcoming: upcoming.slice(1),
          nextTrip: upcoming[0] || null,
          waitlist,
          past,
          tab,
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
    const item = [].concat(this.data.upcoming, this.data.waitlist, this.data.past).find((row) => Number(row.id) === id);
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
    const item = [].concat(this.data.upcoming, this.data.waitlist, this.data.past).find((row) => String(row.id) === String(id));
    wx.showModal({
      title: "取消报名",
      content: item && item.refundHint ? "确定取消报名？" + item.refundHint + "。名额将释放给其他人。已付款按付款人原路退回。" : "确定取消报名？名额将释放给其他人。已付款按付款人原路退回。",
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
