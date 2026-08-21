const { request, showError } = require("../../utils/request");
const { genderText } = require("../../utils/labels");

Page({
  data: { g: null, err: "" },
  onLoad(q) {
    this.load(q.id);
  },
  async load(id) {
    try {
      const res = await request("/guides/" + id);
      const g = res.data || {};
      const specialtyList = String(g.specialties || "")
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter(Boolean);
      this.setData({
        g: Object.assign({}, g, {
          initial: String(g.name || "导").slice(0, 1),
          genderText: genderText(g.gender),
          specialtyList,
          upcoming: g.upcoming || [],
        }),
        err: "",
      });
    } catch (e) {
      this.setData({ err: (e && e.message) || "导游不存在" });
      showError("加载失败", e);
    }
  },
  goSch(e) {
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + e.currentTarget.dataset.id });
  },
});
