const { request } = require("../../utils/request");
const { loadRouteCatalog } = require("../../utils/route-catalog");
const { detailUrl } = require("../../utils/media");

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
        q: filter.q || "",
      });
      getApp().globalData.routeFilter = null;
    }
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
    const { list, err } = await loadRouteCatalog({
      q: this.data.q || "",
      days: this.data.days,
      tag: this.data.tag,
    });
    this.setData({ list, err });
  },
  go(e) {
    wx.navigateTo({ url: detailUrl(e.currentTarget.dataset.id) });
  },
});
