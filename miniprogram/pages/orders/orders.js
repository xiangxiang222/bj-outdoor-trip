const { request, showError } = require("../../utils/request");
const { enrollStatusText } = require("../../utils/labels");
const app = getApp();

function ymd() {
  const d = new Date();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
}

function decorate(item) {
  const cancelled = item.status === "cancelled" || item.schedule_status === "cancelled";
  const date = String(item.start_date || "").slice(0, 10);
  return Object.assign({}, item, {
    statusText: enrollStatusText(item),
    kindLabel: item.channel === "activity" ? "同城局" : "山野团",
    upcoming: !cancelled && date >= ymd(),
  });
}

Page({
  data: { loggedIn: false, upcoming: [], past: [], reviewingId: 0, rating: 5, content: "" },
  onShow() {
    if (!app.globalData.token) {
      this.setData({ loggedIn: false, upcoming: [], past: [] });
      return;
    }
    this.setData({ loggedIn: true });
    this.load();
  },
  load() {
    request("/orders")
      .then((r) => {
        const list = (r.data || []).map(decorate);
        this.setData({
          upcoming: list.filter((x) => x.upcoming),
          past: list.filter((x) => !x.upcoming),
          reviewingId: 0,
          content: "",
        });
      })
      .catch(() => this.setData({ upcoming: [], past: [] }));
  },
  goLogin() {
    wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/orders/orders") });
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
    const item = [].concat(this.data.upcoming, this.data.past).find((row) => Number(row.id) === id);
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
    wx.showModal({
      title: "取消报名",
      content: "确定取消报名？名额将释放给其他人。已付款的会标记退款。",
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
