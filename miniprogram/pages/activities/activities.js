const { request } = require("../../utils/request");
const { KINDS, activityRows, activityFacts, kindOf } = require("../../utils/activity-kind");
const { coverOf, hostName } = require("../../utils/feed-card");
const { absMedia } = require("../../utils/media");
const { isDark } = require("../../utils/appearance");
const { translate } = require("../../utils/locale");

const SORTS = ["soon", "filling", "new"];
const SORT_LABELS = ["即将开始", "快满员", "最新发布"];
const TIMES = [{ key: "", label: "不限日期" }, { key: "today", label: "今天" }, { key: "weekend", label: "周末" }, { key: "week", label: "本周" }];
const ART = { "掼蛋": "cards", "跑步": "run", "电影": "movie", "招募": "club" };

Page({
  data: {
    rows: [], list: [], kinds: KINDS.map((item) => ({ ...item, art: ART[item.key] })), kind: "", selectedKind: null,
    query: "", time: "", times: TIMES, city: "", cities: ["全部城区"], cityPickerLabels: ["全部城区"], cityIndex: 0,
    sort: "soon", sortIndex: 0, sortLabels: SORT_LABELS, sortPickerLabels: SORT_LABELS, sortText: SORT_LABELS[0],
    freeOnly: false, availableOnly: false, hasFilters: false, hasRefinements: false,
    loading: true, loadError: false, dark: false, activeCount: 0,
  },
  onLoad(options) {
    let key = String((options && options.kind) || "");
    try { key = decodeURIComponent(key); } catch (_) { key = ""; }
    if (KINDS.some((item) => item.key === key)) this.setData({ kind: key });
  },
  onShow() {
    this._unloaded = false;
    this.setData({ dark: isDark() });
    this.apply();
    return this.load();
  },
  onUnload() { this._unloaded = true; this._requestId = (this._requestId || 0) + 1; },
  onPullDownRefresh() {
    return this.load().finally(() => { if (wx.stopPullDownRefresh) wx.stopPullDownRefresh(); });
  },
  load() {
    if (this._loadPromise) return this._loadPromise;
    const requestId = this._requestId = (this._requestId || 0) + 1;
    this.setData({ loading: true, loadError: false });
    this._loadPromise = request("/schedules?channel=activity")
      .then((response) => {
        if (this._unloaded || requestId !== this._requestId) return;
        if (!Array.isArray(response && response.data)) throw new Error("Invalid activity list");
        const rows = response.data;
        const all = activityRows(rows);
        const cities = ["全部城区"].concat([...new Set(all.map((row) => String(row.city || "").trim()).filter(Boolean))]);
        // Keep an existing selected district visible when a refreshed list has no matches there.
        if (this.data.city && !cities.includes(this.data.city)) cities.push(this.data.city);
        this.setData({ rows, cities, cityIndex: Math.max(0, cities.indexOf(this.data.city)), loading: false });
        this.apply();
      })
      .catch(() => {
        if (!this._unloaded && requestId === this._requestId) this.setData({ loading: false, loadError: true });
      })
      .finally(() => { if (requestId === this._requestId) this._loadPromise = null; });
    return this._loadPromise;
  },
  retry() { return this.load(); },
  apply() {
    const { rows, kind, query, sort, city, time, freeOnly, availableOnly } = this.data;
    const app = getApp();
    const baseUrl = app && app.globalData && app.globalData.baseUrl;
    const list = activityRows(rows, { kind, query, sort, city, time, freeOnly, availableOnly }).map((row) => {
      const definition = kindOf(row);
      return { ...row, facts: activityFacts(row), cover: absMedia(coverOf(row), baseUrl), host: hostName(row), kindLabel: definition ? definition.label : "同城活动", art: definition ? ART[definition.key] : "club" };
    });
    const selectedKind = KINDS.find((item) => item.key === kind) || null;
    const hasRefinements = !!(String(query).trim() || city || time || freeOnly || availableOnly || sort !== "soon");
    this.setData({ list, selectedKind, activeCount: activityRows(rows).length, hasRefinements, hasFilters: !!kind || hasRefinements, sortText: SORT_LABELS[SORTS.indexOf(sort)] || SORT_LABELS[0], cityPickerLabels: this.data.cities.map((label) => translate(label, this.data.lang)), sortPickerLabels: SORT_LABELS.map((label) => translate(label, this.data.lang)) });
  },
  onQuery(event) { this.setData({ query: event.detail.value || "" }); this.apply(); },
  clearQuery() { this.setData({ query: "" }); this.apply(); },
  setKind(event) {
    const key = event.currentTarget.dataset.key;
    if (!KINDS.some((item) => item.key === key)) return;
    this.setData({ kind: this.data.kind === key ? "" : key });
    this.apply();
  },
  setTime(event) {
    const key = event.currentTarget.dataset.key;
    if (!TIMES.some((item) => item.key === key)) return;
    this.setData({ time: key }); this.apply();
  },
  setCity(event) {
    const index = Number(event.detail.value);
    if (!Number.isInteger(index) || !this.data.cities[index]) return;
    this.setData({ cityIndex: index, city: index ? this.data.cities[index] : "" }); this.apply();
  },
  setSort(event) {
    const index = Number(event.detail.value);
    if (!SORTS[index]) return;
    this.setData({ sort: SORTS[index], sortIndex: index }); this.apply();
  },
  toggleFree() { this.setData({ freeOnly: !this.data.freeOnly }); this.apply(); },
  toggleAvailable() { this.setData({ availableOnly: !this.data.availableOnly }); this.apply(); },
  clearFilters() {
    this.setData({ query: "", city: "", cityIndex: 0, time: "", freeOnly: false, availableOnly: false, sort: "soon", sortIndex: 0 });
    this.apply();
  },
  showAll() { this.setData({ kind: "" }); this.clearFilters(); },
  imageError(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (this.data.list[index]) this.setData({ ["list[" + index + "].cover"]: "" });
  },
  go(event) {
    const id = Number(event.currentTarget.dataset.id);
    if (Number.isInteger(id) && id > 0) wx.navigateTo({ url: "/pages/schedule/schedule?id=" + id });
  },
  goPublish() {
    const app = getApp();
    const url = "/pages/publish/publish?channel=activity" + (this.data.kind ? "&kind=" + encodeURIComponent(this.data.kind) : "");
    wx.navigateTo({ url: app.globalData.token ? url : "/pages/login/login?redirect=" + encodeURIComponent(url) });
  },
  goWishes() { wx.navigateTo({ url:"/pages/wishes/wishes" }); },
});
