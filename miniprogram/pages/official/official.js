const { request } = require("../../utils/request");

Page({
  data: {
    accounts: [],
    contacts: {},
    rules: { title: "", summary: "", sections: [] },
    faqs: [],
    openFaq: 0,
    openRule: -1,
  },
  onShow() {
    request("/meta")
      .then((r) => {
        const d = (r && r.data) || {};
        this.setData({
          accounts: d.officialAccounts || [],
          contacts: d.contacts || {},
          rules: d.commonRules || { title: "", summary: "", sections: [] },
          faqs: d.faqs || [],
        });
      })
      .catch(() => {});
  },
  copy(e) {
    const text = e.currentTarget.dataset.text;
    if (!text) return;
    const toast = e.currentTarget.dataset.toast || "已复制";
    wx.setClipboardData({ data: String(text), success: () => wx.showToast({ title: toast, icon: "none" }) });
  },
  toggleFaq(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({ openFaq: this.data.openFaq === i ? -1 : i });
  },
  toggleRule(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({ openRule: this.data.openRule === i ? -1 : i });
  },
  jumpRules() {
    this.setData({ openRule: 0 });
  },
  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },
});
