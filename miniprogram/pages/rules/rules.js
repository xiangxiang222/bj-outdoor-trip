const { request } = require("../../utils/request");

Page({
  data: { rules: { title: "规则", summary: "", sections: [] }, faqs: [] },
  onShow() {
    request("/meta").then((r) => {
      const d = (r && r.data) || {};
      this.setData({
        rules: d.commonRules || this.data.rules,
        faqs: d.faqs || [],
      });
    }).catch(() => {});
  },
});
