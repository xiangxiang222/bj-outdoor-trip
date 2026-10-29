const { request } = require("../../utils/request");
const { loadRouteCatalog } = require("../../utils/route-catalog");
const { detailUrl } = require("../../utils/media");
const { isDark } = require("../../utils/appearance");
const { ROUTE_MODES, readRouteMode, saveRouteMode } = require("../../utils/route-presentation");

Page({
  data: {
    list: [],
    days: 0,
    tag: "",
    tags: [],
    q: "",
    err: "",
    loading: true,
    routeMode: "poster",
    routeModes: ROUTE_MODES,
    routeDark: false,
  },
  onShow() {
    this._routeUnloaded = false;
    this.setData({ routeMode: readRouteMode(), routeDark: isDark() });
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
        .then((r) => { if (!this._routeUnloaded) this.setData({ tags: Array.isArray(r.data) ? r.data : [] }); })
        .catch(() => {});
    }
    return this.search();
  },
  onUnload() { this._routeUnloaded = true; this._routeRequestId = (this._routeRequestId || 0) + 1; },
  setRouteMode(e) {
    const value = e.currentTarget.dataset.mode;
    if (!ROUTE_MODES.some((mode) => mode.key === value)) return;
    this.setData({ routeMode: saveRouteMode(value) });
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
    const requestId = this._routeRequestId = (this._routeRequestId || 0) + 1;
    this.setData({ loading: true, err: "" });
    try {
      const { list, err } = await loadRouteCatalog({
        q: this.data.q || "",
        days: this.data.days,
        tag: this.data.tag,
      });
      if (this._routeUnloaded || requestId !== this._routeRequestId) return;
      this.setData({ ...(err ? {} : { list }), err, loading: false });
    } catch (e) {
      if (this._routeUnloaded || requestId !== this._routeRequestId) return;
      this.setData({ err: (e && e.message) || "加载失败", loading: false });
    }
  },
  clearRouteFilters() {
    this.setData({ days: 0, tag: "", q: "" });
    return this.search();
  },
  onRouteImageError(e) {
    const id = Number(e.currentTarget.dataset.id);
    const index = this.data.list.findIndex((item) => Number(item.id) === id);
    if (index >= 0) this.setData({ ["list[" + index + "].imageBroken"]: true });
  },
  goRoute(e) { this.go(e); },
  go(e) {
    wx.navigateTo({ url: detailUrl(e.currentTarget.dataset.id) });
  },
  goApply() {
    if (!getApp().globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/route-apply/route-apply") });
      return;
    }
    wx.navigateTo({ url: "/pages/route-apply/route-apply" });
  },
});
