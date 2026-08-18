const { request, showError } = require("../../utils/request");
const { enrollStatusText } = require("../../utils/labels");
const { detailUrl } = require("../../utils/media");
const app = getApp();
Page({
  data: { list: [] },
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
        this.setData({ list });
      })
      .catch(() => {
        wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/orders/orders") });
      });
  },
  go(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: detailUrl(id) });
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
