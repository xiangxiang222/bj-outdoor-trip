const { request } = require("../../utils/request");
const { detailUrl } = require("../../utils/media");
const app = getApp();
Page({
  data: { list: [], loading: true },
  onShow() {
    if (!app.globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/views/views") });
      return;
    }
    request("/me/views").then((r) => this.setData({ list: r.data || [], loading: false })).catch(() => this.setData({ loading: false }));
  },
  go(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: detailUrl(id) });
  },
});
