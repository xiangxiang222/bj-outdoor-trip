const { request } = require("../../utils/request");
const { detailUrl } = require("../../utils/media");
const app = getApp();
Page({
  data: { list: [] },
  onShow() {
    if (!app.globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/favorites/favorites") });
      return;
    }
    request("/favorites")
      .then((r) => this.setData({ list: r.data || [] }))
      .catch(() => {
        wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/favorites/favorites") });
      });
  },
  go(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: detailUrl(id) });
  },
});
