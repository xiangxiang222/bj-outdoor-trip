const { request } = require("../../utils/request");

Page({
  data: { rules: { title: "规则", summary: "", sections: [] }, faqs: [], ready: false },
  onShow() {
    request("/meta").then((r) => {
      const d = (r && r.data) || {};
      this.setData({
        rules: d.commonRules || this.data.rules,
        faqs: d.faqs || [],
        ready: true,
      });
    }).catch(() => this.setData({ ready: true }));
  },
});
