const { loadRouteCatalog, loadRoutePreferences, preferenceView } = require("../../utils/route-catalog");
const { detailUrl } = require("../../utils/media");
const { isDark } = require("../../utils/appearance");
const { ROUTE_MODES, readRouteMode, saveRouteMode } = require("../../utils/route-presentation");

Page({
  data: {
    list: [],
    days: 0,
    routePreference: "",
    routePreferences: [],
    routePrimaryPreferences: [],
    routeMorePreferences: [],
    routeMoreOpen: false,
    routePreferenceTotal: null,
    routePreferenceLoading: true,
    routePreferenceErr: "",
    routePreferenceScroll: "route-pref-all",
    routePreferenceName: "",
    q: "",
    err: "",
    routeErrCode: "",
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
        routePreference: typeof filter.preference === "string" ? filter.preference : "",
        q: filter.q || "",
      });
      getApp().globalData.routeFilter = null;
    }
    return this.search();
  },
  onUnload() {
    this._routeUnloaded = true;
    this._routeRequestId = (this._routeRequestId || 0) + 1;
    this._preferenceRequestId = (this._preferenceRequestId || 0) + 1;
  },
  setRouteMode(e) {
    const value = e.currentTarget.dataset.mode;
    if (!ROUTE_MODES.some((mode) => mode.key === value)) return;
    this.setData({ routeMode: saveRouteMode(value) });
  },
  setRoutePreference(e) {
    const preference = e.currentTarget.dataset.preference || "";
    const option = this.data.routePreferences.find((item) => item.key === preference);
    if (preference && !option) return;
    if (preference === this.data.routePreference) return;
    this.setData({ routePreference: preference });
    this.refreshPreferenceView();
    return this.search();
  },
  refreshPreferenceView() {
    const previousName = this._selectedPreferenceName && this._selectedPreferenceName.key === this.data.routePreference ? this._selectedPreferenceName.name : "";
    const view = preferenceView(this.data.routePreferences, this.data.routePreference, this.data.routeMoreOpen, previousName);
    this._selectedPreferenceName = { key: this.data.routePreference, name: view.selectedName };
    const preference = this.data.routePreference;
    this.setData({
      routePrimaryPreferences: view.primary,
      routeMorePreferences: view.more,
      routePreferenceName: view.selectedName,
      routePreferenceScroll: "",
    });
    const reveal = () => {
      if (!this._routeUnloaded && this.data.routePreference === preference) this.setData({ routePreferenceScroll: "route-pref-" + (preference || "all") });
    };
    if (wx.nextTick) wx.nextTick(reveal);
    else reveal();
  },
  toggleRoutePreferences() {
    this.setData({ routeMoreOpen: !this.data.routeMoreOpen });
    this.refreshPreferenceView();
  },
  reloadRoutePreferences() { return this.loadPreferences(true); },
  loadPreferences(force = false) {
    const filters = { q: String(this.data.q || "").trim(), days: this.data.days };
    const base = JSON.stringify(filters);
    if (!force && this._preferenceBase === base) {
      if (this._preferencePromise) return this._preferencePromise;
      if (this._preferenceReady) return Promise.resolve();
    }
    const requestId = this._preferenceRequestId = (this._preferenceRequestId || 0) + 1;
    this._preferenceBase = base;
    this._preferenceReady = false;
    this.setData({ routePreferences: this.data.routePreferences.map((item) => ({ ...item, count: null })), routePreferenceTotal: null, routePreferenceLoading: true, routePreferenceErr: "" });
    this.refreshPreferenceView();
    const task = loadRoutePreferences(filters).then(({ options, total, err }) => {
      if (this._routeUnloaded || requestId !== this._preferenceRequestId) return;
      if (err) {
        this.setData({ routePreferenceLoading: false, routePreferenceErr: err });
      } else {
        this._preferenceReady = true;
        this.setData({ routePreferences: options, routePreferenceTotal: total, routePreferenceLoading: false, routePreferenceErr: "" });
        this.refreshPreferenceView();
      }
    }).finally(() => {
      if (requestId === this._preferenceRequestId) this._preferencePromise = null;
    });
    this._preferencePromise = task;
    return task;
  },
  setDays(e) {
    this.setData({ days: e.currentTarget.dataset.d === "multi" ? "multi" : Number(e.currentTarget.dataset.d) });
    return this.search();
  },
  onSearch(e) {
    this.setData({ q: (e.detail && e.detail.value) || "" });
    return this.search();
  },
  async search() {
    const requestId = this._routeRequestId = (this._routeRequestId || 0) + 1;
    const preferences = this.loadPreferences();
    this.refreshPreferenceView();
    this.setData({ loading: true, err: "", routeErrCode: "" });
    try {
      const { list, err, code } = await loadRouteCatalog({
        q: this.data.q || "",
        preference: this.data.routePreference,
        days: this.data.days,
      });
      if (this._routeUnloaded || requestId !== this._routeRequestId) return;
      const unavailable = code === "ROUTE_PREFERENCE_UNAVAILABLE";
      this.setData({ ...(unavailable ? { list: [] } : err ? {} : { list }), err, routeErrCode: code || "", loading: false });
      if (unavailable) await this.loadPreferences(true);
    } catch (e) {
      if (this._routeUnloaded || requestId !== this._routeRequestId) return;
      this.setData({ err: (e && e.message) || "加载失败", loading: false });
    }
    await preferences;
  },
  clearRouteFilters() {
    this.setData({ routePreference: "", days: 0, q: "" });
    this.refreshPreferenceView();
    return this.search();
  },
  clearRouteFilter(e) {
    const field = { preference: "routePreference", q: "q", days: "days" }[e.currentTarget.dataset.key];
    if (!field) return;
    this.setData({ [field]: field === "days" ? 0 : "" });
    this.refreshPreferenceView();
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
