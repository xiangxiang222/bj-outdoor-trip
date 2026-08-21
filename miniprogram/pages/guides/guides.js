const { request, showError } = require("../../utils/request");

Page({
  data: { list: [], err: "" },
  onLoad() {
    this.load();
  },
  async load() {
    try {
      const res = await request("/guides");
      const list = (res.data || []).map((g) => Object.assign({}, g, { initial: String(g.name || "导").slice(0, 1) }));
      this.setData({ list, err: "" });
    } catch (e) {
      this.setData({ err: (e && e.message) || "加载失败" });
    }
  },
  go(e) {
    wx.navigateTo({ url: "/pages/guide/guide?id=" + e.currentTarget.dataset.id });
  },
});
