const { request, showError } = require("../../utils/request");

Page({
  data: { list: [], err: "", recruit: { copy: "推荐领队 首次带队完成后 奖励推荐者200元", reward: 200, code: "" } },
  onLoad() {
    this.load();
  },
  async load() {
    try {
      const res = await request("/guides");
      const list = (res.data || []).map((g) => Object.assign({}, g, { initial: String(g.name || "导").slice(0, 1) }));
      let recruit = this.data.recruit;
      try {
        const rec = await request("/guides/recruit");
        recruit = rec.data || recruit;
      } catch (e) { /* ignore */ }
      this.setData({ list, recruit, err: "" });
    } catch (e) {
      this.setData({ err: (e && e.message) || "加载失败" });
    }
  },
  go(e) {
    wx.navigateTo({ url: "/pages/guide/guide?id=" + e.currentTarget.dataset.id });
  },
});
