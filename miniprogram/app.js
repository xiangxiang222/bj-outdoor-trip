const { baseUrl } = require("./config");

App({
  globalData: {
    baseUrl,
    token: "",
    user: null,
    routeFilter: null,
  },
  onLaunch() {
    this.globalData.token = wx.getStorageSync("bj_token") || "";
    this.globalData.user = wx.getStorageSync("bj_user") || null;
  },
});
