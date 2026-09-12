const { request } = require("../../utils/request");
const { hostName } = require("../../utils/feed-card");
Page({
  data: { list: [] },
  onShow() {
    request("/schedules")
      .then((r) => this.setData({ list: (r.data || []).map((s) => Object.assign({}, s, { host: hostName(s) })) }))
      .catch(() => this.setData({ list: [] }));
  },
  go(e) { wx.navigateTo({ url: "/pages/schedule/schedule?id=" + e.currentTarget.dataset.id }); },
  goGuide(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: "/pages/guide/guide?id=" + id });
  },
  goGuides() {
    wx.navigateTo({ url: "/pages/guides/guides" });
  },
  goPublish() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/publish/publish") });
      return;
    }
    wx.navigateTo({ url: "/pages/publish/publish" });
  },
});
