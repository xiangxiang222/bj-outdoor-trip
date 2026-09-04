const { request } = require("../../utils/request");
const app = getApp();

Page({
  data: {
    id: "",
    s: null,
    posts: [],
    msg: "",
    rating: 5,
    reviewText: "",
    shareUrl: "",
    caption: "",
  },
  onLoad(q) {
    this.setData({ id: q.id || "" });
  },
  onShow() {
    this.load();
  },
  async load() {
    if (!this.data.id) return;
    try {
      const [after, contest] = await Promise.all([
        request("/schedules/" + this.data.id + "/after"),
        request("/schedules/" + this.data.id + "/contest"),
      ]);
      this.setData({ s: after.data, posts: contest.data || [] });
    } catch (e) {
      this.setData({ msg: (e && e.message) || "加载失败" });
    }
  },
  needLogin() {
    if (app.globalData.token) return true;
    wx.navigateTo({
      url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/after/after?id=" + this.data.id),
    });
    return false;
  },
  async complete() {
    if (!this.needLogin()) return;
    try {
      await request("/schedules/" + this.data.id + "/complete", "POST");
      this.setData({ msg: "已完成，可以评价、抽奖和参加评选" });
      this.load();
    } catch (e) {
      this.setData({ msg: (e && e.message) || "提交失败" });
    }
  },
  pickStar(e) {
    this.setData({ rating: Number(e.currentTarget.dataset.n) });
  },
  setReview(e) {
    this.setData({ reviewText: e.detail.value });
  },
  async submitReview() {
    if (!this.needLogin()) return;
    try {
      await request("/reviews", "POST", {
        scheduleId: Number(this.data.id),
        rating: this.data.rating,
        content: this.data.reviewText,
      });
      this.setData({ msg: "评价已提交" });
      this.load();
    } catch (e) {
      this.setData({ msg: (e && e.message) || "评价失败" });
    }
  },
  async drawPost() {
    if (!this.needLogin()) return;
    try {
      const res = await request("/lottery/draw", "POST", { phase: "post", scheduleId: Number(this.data.id) });
      this.setData({
        msg: res.data.matched ? "两次一致，已翻倍" : "抽到：" + res.data.prizeLabel,
      });
      this.load();
    } catch (e) {
      this.setData({ msg: (e && e.message) || "抽奖失败" });
    }
  },
  setUrl(e) {
    this.setData({ shareUrl: e.detail.value });
  },
  setCaption(e) {
    this.setData({ caption: e.detail.value });
  },
  async submitPost() {
    if (!this.needLogin()) return;
    try {
      await request("/schedules/" + this.data.id + "/contest", "POST", {
        url: this.data.shareUrl,
        caption: this.data.caption,
      });
      this.setData({ shareUrl: "", caption: "" });
      this.load();
    } catch (e) {
      this.setData({ msg: (e && e.message) || "提交失败" });
    }
  },
  openUrl(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.setClipboardData({ data: url });
  },
  async vote(e) {
    if (!this.needLogin()) return;
    try {
      const res = await request("/contest/" + e.currentTarget.dataset.id + "/vote", "POST");
      this.setData({ posts: res.data || [] });
    } catch (err) {
      this.setData({ msg: (err && err.message) || "投票失败" });
    }
  },
});
