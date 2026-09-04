const { request } = require("../../utils/request");
const app = getApp();

Page({
  data: { state: { pre: null, post: null, canPre: false }, msg: "", scheduleId: 0 },
  onLoad(q) {
    this.setData({ scheduleId: Number(q.scheduleId || 0) });
  },
  onShow() {
    this.load();
  },
  async load() {
    if (!app.globalData.token) {
      this.setData({ state: { pre: null, post: null, canPre: false } });
      return;
    }
    try {
      const res = await request("/lottery?scheduleId=" + this.data.scheduleId);
      this.setData({ state: res.data || {} });
    } catch (e) {
      this.setData({ msg: (e && e.message) || "加载失败" });
    }
  },
  async draw() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/lottery/lottery") });
      return;
    }
    try {
      const res = await request("/lottery/draw", "POST", { phase: "pre", scheduleId: this.data.scheduleId });
      this.setData({ msg: res.data.already ? "已经抽过了" : "抽到：" + res.data.prizeLabel });
      this.load();
    } catch (e) {
      this.setData({ msg: (e && e.message) || "抽奖失败" });
    }
  },
});
