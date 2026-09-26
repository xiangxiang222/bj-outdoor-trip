const { request } = require("../../utils/request");
const app = getApp();

function openHref(href) {
  const text = String(href || "");
  const sch = text.match(/\/m\/schedule\/(\d+)/);
  if (sch) {
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + sch[1] });
    return;
  }
  if (text.indexOf("/m/orders") === 0) {
    const tab = (text.split("tab=")[1] || "refund").split("&")[0];
    app.globalData.ordersTab = tab;
    wx.switchTab({ url: "/pages/orders/orders" });
    return;
  }
  const pages = {
    "/m/leader": "/pages/leader/leader",
    "/m/student": "/pages/student/student",
    "/m/route-apply": "/pages/route-apply/route-apply",
  };
  if (pages[text]) wx.navigateTo({ url: pages[text] });
}

Page({
  data: { list: [], unread: 0 },
  onShow() {
    if (!app.globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/notices/notices") });
      return;
    }
    request("/me/notices").then((r) => this.setData({ list: r.data || [], unread: r.unread || 0 })).catch(() => {});
  },
  readAll() {
    request("/me/notices/read-all", "POST").then((r) => this.setData({ list: r.data || [], unread: 0 })).catch(() => {});
  },
  open(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    if (!item) return;
    request("/me/notices/" + item.id + "/read", "POST").catch(() => {});
    openHref(item.href);
  },
});
