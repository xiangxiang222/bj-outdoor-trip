const { request, showError } = require("../../utils/request");
const { enrollStatusText } = require("../../utils/labels");
const { detailUrl } = require("../../utils/media");
const app = getApp();
Page({
  data: { list: [], reviewingId: 0, rating: 5, content: "" },
  onShow() {
    if (!app.globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/orders/orders") });
      return;
    }
    this.load();
  },
  load() {
    request("/orders")
      .then((r) => {
        const list = (r.data || []).map((item) =>
          Object.assign({}, item, { statusText: enrollStatusText(item) })
        );
        this.setData({ list, reviewingId: 0, content: "" });
      })
      .catch(() => {
        wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/orders/orders") });
      });
  },
  goAfter(e) {
    const sid = e.currentTarget.dataset.sid;
    if (!sid) return;
    wx.navigateTo({ url: "/pages/after/after?id=" + sid });
  },
  go(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: detailUrl(id) });
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
    const item = (this.data.list || []).find((row) => Number(row.id) === id);
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
