const { request } = require("../../utils/request");
const app = getApp();

function statusText(status) {
  if (status === "success") return "已支付";
  if (status === "refunded") return "已退款";
  if (status === "cancelled") return "已取消";
  if (status === "pending" || status === "settling") return "处理中";
  return status || "";
}

Page({
  data: { tradeNo: "", order: null, statusText: "", err: "" },
  onLoad(q) {
    this.setData({ tradeNo: decodeURIComponent(q.tradeNo || q.id || "") });
  },
  onShow() {
    this.load();
  },
  async load() {
    const tradeNo = this.data.tradeNo;
    if (!tradeNo) {
      this.setData({ err: "缺少订单号" });
      return;
    }
    if (!app.globalData.token) {
      wx.navigateTo({
        url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/order-detail/order-detail?tradeNo=" + encodeURIComponent(tradeNo)),
      });
      return;
    }
    try {
      const res = await request("/pay/order/" + encodeURIComponent(tradeNo));
      const order = res.data || null;
      this.setData({ order, statusText: statusText(order && order.status), err: "" });
    } catch (e) {
      this.setData({ err: e.message || "订单打不开" });
    }
  },
  goTrip() {
    const id = this.data.order && this.data.order.scheduleId;
    if (!id) return;
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + id });
  },
  goWallet() {
    wx.navigateTo({ url: "/pages/wallet/wallet" });
  },
});
