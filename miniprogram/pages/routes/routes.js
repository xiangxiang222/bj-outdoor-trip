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
    tag: "",
    tags: [],
    q: "",
    err: "",
  },
  onShow() {
    const filter = getApp().globalData.routeFilter;
    if (filter) {
      this.setData({
        days: filter.days || 0,
        tag: filter.tag || filter.category || "",
      });
      getApp().globalData.routeFilter = null;
    }
    if (!this.data.list.length) this.setData({ list: withLocalMediaList(asList(lite)) });
    if (!this.data.tags.length) {
      request("/play-tags")
        .then((r) => this.setData({ tags: r.data || [] }))
        .catch(() => {});
    }
    this.search();
  },
  setDays(e) {
    this.setData({ days: e.currentTarget.dataset.d === "multi" ? "multi" : Number(e.currentTarget.dataset.d) });
    this.search();
  },
  setTag(e) {
    this.setData({ tag: e.currentTarget.dataset.c || "" });
    this.search();
  },
  onSearch(e) {
    this.setData({ q: (e.detail && e.detail.value) || "" });
    this.search();
  },
  async search() {
    const q = this.data.q || "";
    const days = this.data.days;
    const tag = this.data.tag;
    const local = withLocalMediaList(asList(lite)).filter((r) => {
      if (days === "multi" && r.days < 4) return false;
      if (days && days !== "multi" && r.days !== days) return false;
      if (tag && r.category !== tag && !(r.tags || []).includes(tag)) return false;
      if (q && !(r.title + r.region + r.subtitle).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    const params = [];
    if (q) params.push("q=" + encodeURIComponent(q));
    if (days) params.push("days=" + days);
    if (tag) params.push("tag=" + encodeURIComponent(tag));
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
