const { request } = require("../../utils/request");
const app = getApp();
Page({
  data: { list: [] },
  onShow() {
    if (!app.globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/follows/follows") });
      return;
    }
    request("/me/follows").then((r) => this.setData({ list: r.data || [] })).catch(() => {});
  },
  open(e) {
    wx.navigateTo({ url: "/pages/user/user?id=" + e.currentTarget.dataset.id });
  },
  unfollow(e) {
    const id = e.currentTarget.dataset.id;
    request("/me/follows/" + id, "DELETE").then(() => {
      this.setData({ list: this.data.list.filter((row) => String(row.id) !== String(id)) });
    }).catch(() => {});
  },
});
