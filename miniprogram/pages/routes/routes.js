const { request } = require("../../utils/request");
const lite = require("../../data/routes-lite");
const { withLocalMediaList, detailUrl } = require("../../utils/media");

function asList(rows) {
  return Array.isArray(rows) && rows.length ? rows : [];
}

Page({
  data: {
    list: [],
    days: 0,
    category: "全部",
    cats: ["全部", "长城", "玩水", "登山", "山水", "文化", "草原", "海滨"],
    q: "",
    err: "",
  },
  onShow() {
    const filter = getApp().globalData.routeFilter;
    if (filter) {
      this.setData({
        days: Number(filter.days) || 0,
        category: filter.category || "全部",
      });
      getApp().globalData.routeFilter = null;
    }
    if (!this.data.list.length) this.setData({ list: withLocalMediaList(asList(lite)) });
    this.search();
  },
  setDays(e) {
    this.setData({ days: Number(e.currentTarget.dataset.d) });
    this.search();
  },
  setCat(e) {
    this.setData({ category: e.currentTarget.dataset.c });
    this.search();
  },
  onSearch(e) {
    this.setData({ q: (e.detail && e.detail.value) || "" });
    this.search();
  },
  async search() {
    const q = this.data.q || "";
    const days = this.data.days;
    const category = this.data.category;
    const local = withLocalMediaList(asList(lite)).filter((r) => {
      if (days && r.days !== days) return false;
      if (category && category !== "全部" && r.category !== category) return false;
      if (q && !(r.title + r.region + r.subtitle).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    const params = [];
    if (q) params.push("q=" + encodeURIComponent(q));
    if (days) params.push("days=" + days);
    if (category && category !== "全部") params.push("category=" + encodeURIComponent(category));
    try {
      const res = await request("/routes" + (params.length ? "?" + params.join("&") : ""));
      const rows = withLocalMediaList(asList(res.data));
      this.setData({ list: rows.length ? rows : local, err: "" });
    } catch (err) {
      this.setData({
        list: local,
        err: local.length ? "" : (err && err.message) || "加载失败",
      });
    }
  },
  go(e) {
    wx.navigateTo({ url: detailUrl(e.currentTarget.dataset.id) });
  },
});
