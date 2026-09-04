const { request } = require("../../utils/request");

Page({
  data: { accounts: [], contacts: {}, rules: { title: "", summary: "", sections: [] } },
  onShow() {
    request("/meta").then((r) => {
      const d = (r && r.data) || {};
      this.setData({
        accounts: d.officialAccounts || [],
        contacts: d.contacts || {},
        rules: d.commonRules || { title: "", summary: "", sections: [] },
      });
    }).catch(() => {});
  },
  copy(e) {
    const text = e.currentTarget.dataset.text;
    if (!text) return;
    wx.setClipboardData({ data: String(text), success: () => wx.showToast({ title: "已复制", icon: "none" }) });
  },
});
