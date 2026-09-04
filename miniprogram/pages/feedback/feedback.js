const { request } = require("../../utils/request");

Page({
  data: {
    kinds: [
      { key: "suggest", label: "功能建议" },
      { key: "bug", label: "找 BUG" },
    ],
    kindIndex: 0,
    content: "",
  },
  onKind(e) {
    this.setData({ kindIndex: Number(e.detail.value) });
  },
  onInput(e) {
    this.setData({ content: e.detail.value });
  },
  async submit() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/feedback/feedback") });
      return;
    }
    try {
      await request("/feedback", "POST", { kind: this.data.kinds[this.data.kindIndex].key, content: this.data.content });
      wx.showToast({ title: "已收到", icon: "none" });
      this.setData({ content: "" });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || "提交失败", icon: "none" });
    }
  },
});
