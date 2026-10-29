const { request } = require("../../utils/request");
const { isDark } = require("../../utils/appearance");
const { OFFER_TYPES } = require("../../utils/offer");
const { detailUrl, normalizeLegacyMedia } = require("../../utils/media");
const { decorateFeed } = require("../../utils/feed-card");
const { cycleSort, hostFacets, processFeed, sortLabel } = require("../../utils/feed-list");
const { loadRouteCatalog } = require("../../utils/route-catalog");
const { ROUTE_MODES, readRouteMode, saveRouteMode } = require("../../utils/route-presentation");
const { chinaDay, departureMonths, availableDepartures, buildDepartureMonth, matchesDepartureTime } = require("../../utils/departure-dates");
function asList(rows) {
  return Array.isArray(rows) && rows.length ? rows : [];
}
function departureSelection(data, draft) {
  const mode = draft ? data.draftMode : "";
  const date = draft ? mode === "date" ? data.draftDate : "" : data.date;
  const month = draft ? mode === "month" ? data.draftMonthKey : "" : data.monthPicked ? data.monthKey : "";
  const festival = draft ? mode === "festival" ? data.draftFestivalKey : "" : data.festivalKey;
  const row = (data.home.festivals || []).find((item) => item.key === festival);
  return {
    date, month,
    preset: draft ? mode === "weekend" || mode === "nextweekend" ? mode : "any" : data.timePreset || "any",
    festivalDates: festival ? (row && row.dates || []).map((item) => item.date) : undefined,
  };
}
function departureLabel(data, draft) {
  const selection = departureSelection(data, draft);
  if (selection.date) return selection.date.replace(/-/g, ".");
  if (selection.month) return selection.month + " 整月";
  const festival = draft ? data.draftFestivalKey : data.festivalKey;
  if (selection.festivalDates) {
    const row = (data.home.festivals || []).find((item) => item.key === festival);
    return row ? row.name : "不限日期";
  }
  if (selection.preset === "weekend") return "本周末";
  if (selection.preset === "nextweekend") return "下周末";
  return "不限日期";
}

Page({
  data: {
    heroIndex: 0,
    statusBarHeight: 24,
    home: { brand: { kicker: "同行者众", lead: "在山野，遇见爱", slides: [] }, cities: [], tags: [], festivals: [], months: [] },
    groups: [],
    allSchedules: [],
    city: "",
    date: "",
    tag: "",
    monthKey: "",
    monthPicked: false,
    festivalKey: "",
    timePreset: "any",
    departurePreset: "any",
    departureLabel: "选日期",
    departureSheet: false,
    departureMonth: "",
    departureCells: [],
    departureWeekdays: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
    departureFestivals: [],
    departureCanPrev: false,
    departureCanNext: true,
    departureMonthCount: 0,
    departureDraftCount: 0,
    draftMode: "any",
    draftDate: "",
    draftMonthKey: "",
    draftFestivalKey: "",
    draftLabel: "不限日期",
    offerFilter: "",
    hostKind: "",
    companyName: "",
    school: "",
    hostCompanies: [],
    hostSchools: [],
    offers: OFFER_TYPES.filter((o) => o.key !== "full"),
    fold: { extra: false },
    picked: [],
    upcoming: null,
    campusAction: "去认证",
    campusDark: false,
    query: "",
    sort: "soon",
    sortText: "即将出发",
    view: "trips",
    searchHint: "搜线路、城区、主理人",
    routeDays: 0,
    routeTag: "",
    routeTags: [],
    routeList: [],
    routeErr: "",
    routeLoading: false,
    routeMode: "poster",
    routeModes: ROUTE_MODES,
    routeDark: false,
    loading: true,
  },
  onLoad() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.setData({ statusBarHeight: info.statusBarHeight || 24 });
    } catch (e) {}
    const cached = normalizeLegacyMedia(wx.getStorageSync("bj_home_cache"));
    if (cached && cached.home) {
      const allSchedules = asList(cached.schedules);
      this.setData({
        loading: false,
        home: cached.home,
        allSchedules,
      });
      this.applyGroups();
    }
    this.load();
  },
  onShow() {
    this._routeUnloaded = false;
    this.setData({ routeMode: readRouteMode(), routeDark: isDark() });
    this.applyGroups();
    const app = getApp();
    if (!app || !app.globalData) return;
    const user = app.globalData.user || {};
    this.setData({
      campusAction: user.isStudent || user.isAlumni ? "已认证" : user.studentStatus === "pending" ? "认证进度" : "去认证",
      campusDark: isDark(),
    });
    if (app.globalData.homeCampus) {
      app.globalData.homeCampus = false;
      this.quickHost({ currentTarget: { dataset: { kind: "campus" } } });
      return;
    }
    if (app.globalData.homeView === "routes") {
      app.globalData.homeView = "";
      this.setView({ currentTarget: { dataset: { view: "routes" } } });
    }
  },
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },
  applyGroups() {
    const { city, tag, offerFilter, allSchedules, query, sort, hostKind, companyName, school } = this.data;
    const facets = hostFacets(allSchedules);
    const base = this.departureBase();
    const selection = departureSelection(this.data);
    const groups = base.filter((row) => matchesDepartureTime(row, selection)).map((row) => decorateFeed(row));
    const activeTime = Boolean(selection.date || selection.month || selection.festivalDates || selection.preset !== "any");
    const timeLabel = departureLabel(this.data);
    const picked = [];
    if (city) picked.push({ key: "city", label: city });
    if (activeTime) picked.push({ key: "time", label: timeLabel });
    if (tag) picked.push({ key: "tag", label: tag });
    if (offerFilter) {
      const o = this.data.offers.find((x) => x.key === offerFilter);
      if (o) picked.push({ key: "offer", label: o.label });
    }
    if (hostKind === "official") picked.push({ key: "host", label: "官方团" });
    if (hostKind === "company") picked.push({ key: "host", label: "公司团" });
    if (hostKind === "campus") picked.push({ key: "host", label: "高校团" });
    if (hostKind === "individual") picked.push({ key: "host", label: "个人拼团" });
    if (companyName) picked.push({ key: "company", label: companyName });
    if (school) picked.push({ key: "school", label: school });
    if (String(query || "").trim()) picked.push({ key: "q", label: "搜 " + String(query).trim() });
    if (sort !== "soon") picked.push({ key: "sort", label: sortLabel(sort) });
    this.setData({ groups, picked, departurePreset: selection.date || selection.month || selection.festivalDates ? "custom" : selection.preset, departureLabel: timeLabel, sortText: sortLabel(sort), hostCompanies: facets.companies, hostSchools: facets.schools });
    if (this.data.departureSheet) this.paintDepartureSheet();
  },
  departureBase() {
    const { city, tag, offerFilter, allSchedules, query, sort, hostKind, companyName, school } = this.data;
    return availableDepartures(processFeed(allSchedules, { city, tag, offerFilter, query, sort, hostKind, companyName, school, channel: "trip" }));
  },
  setDeparturePreset(e) {
    const key = e.currentTarget.dataset.key;
    if (!["any", "weekend", "nextweekend"].includes(key)) return;
    this.setData({ timePreset: key, date: "", monthPicked: false, monthKey: "", festivalKey: "" });
    this.applyGroups();
  },
  clearDepartureTime() {
    this.setDeparturePreset({ currentTarget: { dataset: { key: "any" } } });
  },
  openDepartureDates() {
    this.applyGroups();
    const months = departureMonths();
    const selection = departureSelection(this.data);
    const firstFestivalDate = (selection.festivalDates || []).filter((date) => date >= chinaDay()).sort()[0];
    const candidate = (selection.date || selection.month || firstFestivalDate || "").slice(0, 7);
    const month = months.some((item) => item.key === candidate) ? candidate : months[0].key;
    const mode = selection.date ? "date" : selection.month ? "month" : selection.festivalDates ? "festival" : selection.preset;
    this.setData({ departureSheet: true, departureMonth: month, draftMode: mode, draftDate: selection.date || "", draftMonthKey: selection.month || "", draftFestivalKey: this.data.festivalKey || "" });
    this.paintDepartureSheet();
  },
  closeDepartureDates() {
    this.setData({ departureSheet: false });
    this.applyGroups();
  },
  departureNoop() {},
  paintDepartureSheet() {
    const months = departureMonths();
    const index = months.findIndex((item) => item.key === this.data.departureMonth);
    const base = this.departureBase();
    const today = chinaDay();
    const lastMonth = months[months.length - 1].key;
    const festivals = (this.data.home.festivals || []).map((item) => ({ ...item, dates: (item.dates || []).filter((day) => day.date >= today && day.date.slice(0, 7) <= lastMonth) })).filter((item) => item.dates.length);
    this.setData({
      departureCells: buildDepartureMonth(this.data.departureMonth, base),
      departureCanPrev: index > 0,
      departureCanNext: index >= 0 && index < months.length - 1,
      departureMonthCount: base.filter((row) => matchesDepartureTime(row, { month: this.data.departureMonth })).length,
      departureDraftCount: base.filter((row) => matchesDepartureTime(row, departureSelection(this.data, true))).length,
      departureFestivals: festivals,
      draftLabel: departureLabel(this.data, true),
    });
  },
  moveDepartureMonth(e) {
    const offset = Number(e.currentTarget.dataset.offset);
    if (offset !== -1 && offset !== 1) return;
    const months = departureMonths();
    const index = months.findIndex((item) => item.key === this.data.departureMonth);
    const next = months[index + offset];
    if (!next || index < 0) return;
    this.setData({ departureMonth: next.key });
    this.paintDepartureSheet();
  },
  selectDepartureDay(e) {
    const date = e.currentTarget.dataset.date;
    const day = this.data.departureCells.find((item) => item.date === date);
    if (!day || day.disabled || !day.date) return;
    const selected = this.data.draftMode === "date" && this.data.draftDate === date;
    this.setData({ draftMode: selected ? "any" : "date", draftDate: selected ? "" : date, draftMonthKey: "", draftFestivalKey: "" });
    this.paintDepartureSheet();
  },
  selectDepartureMonth() {
    const selected = this.data.draftMode === "month" && this.data.draftMonthKey === this.data.departureMonth;
    this.setData({ draftMode: selected ? "any" : "month", draftDate: "", draftMonthKey: selected ? "" : this.data.departureMonth, draftFestivalKey: "" });
    this.paintDepartureSheet();
  },
  selectDepartureFestival(e) {
    const key = e.currentTarget.dataset.key;
    const festival = this.data.departureFestivals.find((item) => item.key === key);
    if (!festival) return;
    const selected = this.data.draftMode === "festival" && this.data.draftFestivalKey === key;
    this.setData({ draftMode: selected ? "any" : "festival", draftDate: "", draftMonthKey: "", draftFestivalKey: selected ? "" : key, ...(!selected ? { departureMonth: festival.dates[0].date.slice(0, 7) } : {}) });
    this.paintDepartureSheet();
  },
  resetDepartureDraft() {
    this.setData({ draftMode: "any", draftDate: "", draftMonthKey: "", draftFestivalKey: "" });
    this.paintDepartureSheet();
  },
  applyDepartureDates() {
    const selection = departureSelection(this.data, true);
    this.setData({ timePreset: selection.preset, date: selection.date, monthKey: selection.month, monthPicked: Boolean(selection.month), festivalKey: this.data.draftMode === "festival" ? this.data.draftFestivalKey : "", departureSheet: false });
    this.applyGroups();
  },
  async load() {
    try {
      const [homeRes, schRes] = await Promise.all([
        request("/home").catch(() => ({ data: {} })),
        request("/schedules?channel=trip").catch(() => ({ data: [] })),
      ]);
      const home = homeRes.data || {};
      const allSchedules = asList(schRes.data);
      this.setData({
        loading: false,
        home,
        allSchedules,
      });
      wx.setStorageSync("bj_home_cache", { home, schedules: allSchedules });
      this.applyGroups();
      this.loadUpcoming();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" });
    }
  },
  onQuery(e) {
    this.setData({ query: e.detail.value || "" });
    clearTimeout(this._searchTimer);
    if (this.data.view === "routes") this._searchTimer = setTimeout(() => this.loadRoutes(), 250);
    else this.applyGroups();
  },
  onUnload() { clearTimeout(this._searchTimer); this._routeUnloaded = true; this._routeRequestId = (this._routeRequestId || 0) + 1; },
  explore() { wx.pageScrollTo({ selector: "#explore", duration: 300 }); },
  showRoutes() {
    this.setView({ currentTarget: { dataset: { view: "routes" } } });
    this.explore();
  },
  quickHost(e) {
    clearTimeout(this._searchTimer);
    this.setData({
      view: "trips",
      hostKind: e.currentTarget.dataset.kind || "",
      "fold.extra": false,
      query: "",
      city: "",
      date: "",
      timePreset: "any",
      tag: "",
      offerFilter: "",
      festivalKey: "",
      monthPicked: false,
      companyName: "",
      school: "",
      searchHint: "搜线路、城区、主理人",
    });
    this.applyGroups();
    this.explore();
  },
  setView(e) {
    const view = e.currentTarget.dataset.view || "trips";
    this.setData({
      view,
      routeTag: view === "routes" ? this.data.tag || "" : this.data.routeTag,
      searchHint: view === "routes" ? "搜长城 / 十渡 / 坝上" : "搜线路、城区、主理人",
    });
    if (view === "routes") this.loadRoutes();
  },
  setRouteDays(e) {
    const d = e.currentTarget.dataset.d;
    this.setData({ routeDays: d === "multi" ? "multi" : Number(d) });
    this.loadRoutes();
  },
  setRouteTag(e) {
    this.setData({ routeTag: e.currentTarget.dataset.c || "" });
    this.loadRoutes();
  },
  setRouteMode(e) {
    const value = e.currentTarget.dataset.mode;
    if (!ROUTE_MODES.some((mode) => mode.key === value)) return;
    this.setData({ routeMode: saveRouteMode(value) });
  },
  clearRouteFilters() {
    clearTimeout(this._searchTimer);
    this.setData({ routeDays: 0, routeTag: "", query: "" });
    return this.loadRoutes();
  },
  onRouteImageError(e) {
    const id = Number(e.currentTarget.dataset.id);
    const index = this.data.routeList.findIndex((item) => Number(item.id) === id);
    if (index >= 0) this.setData({ ["routeList[" + index + "].imageBroken"]: true });
  },
  async loadRoutes() {
    const requestId = this._routeRequestId = (this._routeRequestId || 0) + 1;
    const filters = { q: String(this.data.query || "").trim(), days: this.data.routeDays, tag: this.data.routeTag };
    this.setData({ routeLoading: true, routeErr: "" });
    if (!this.data.routeTags.length) {
      try {
        const tagsRes = await request("/play-tags");
        if (this._routeUnloaded || requestId !== this._routeRequestId) return;
        this.setData({ routeTags: tagsRes.data || [] });
      } catch {
        if (this._routeUnloaded || requestId !== this._routeRequestId) return;
        this.setData({ routeTags: this.data.home.tags || [] });
      }
    }
    try {
      const { list, err } = await loadRouteCatalog(filters);
      if (this._routeUnloaded || requestId !== this._routeRequestId) return;
      this.setData({ ...(err ? {} : { routeList: list }), routeErr: err, routeLoading: false });
    } catch (e) {
      if (this._routeUnloaded || requestId !== this._routeRequestId) return;
      this.setData({ routeErr: (e && e.message) || "加载失败", routeLoading: false });
    }
  },
  goRoute(e) {
    wx.navigateTo({ url: detailUrl(e.currentTarget.dataset.id) });
  },
  cycleSort() {
    this.setData({ sort: cycleSort(this.data.sort) });
    this.applyGroups();
  },
  setCity(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ city: this.data.city === name ? "" : name });
    this.applyGroups();
  },
  clearCity() {
    this.setData({ city: "" });
    this.applyGroups();
  },
  setDate(e) {
    const d = e.currentTarget.dataset.date;
    this.setData({ date: this.data.date === d ? "" : d, timePreset: "any", monthPicked: false, monthKey: "", festivalKey: "" });
    this.applyGroups();
  },
  setTag(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ tag: this.data.tag === name ? "" : name });
    this.applyGroups();
  },
  clearTag() {
    this.setData({ tag: "" });
    this.applyGroups();
  },
  setOffer(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ offerFilter: this.data.offerFilter === key ? "" : key });
    this.applyGroups();
  },
  setFestival(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ festivalKey: this.data.festivalKey === key ? "" : key, date: "", timePreset: "any", monthPicked: false, monthKey: "" });
    this.applyGroups();
  },
  toggleFold(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ["fold." + key]: !this.data.fold[key] });
  },
  clearPick(e) {
    const key = e.currentTarget.dataset.key;
    if (key === "city") this.setData({ city: "" });
    if (["time", "date", "fest", "month"].includes(key)) { this.clearDepartureTime(); return; }
    if (key === "tag") this.setData({ tag: "" });
    if (key === "offer") this.setData({ offerFilter: "" });
    if (key === "q") this.setData({ query: "" });
    if (key === "sort") this.setData({ sort: "soon" });
    if (key === "host") this.setData({ hostKind: "", companyName: "", school: "" });
    if (key === "company") this.setData({ companyName: "" });
    if (key === "school") this.setData({ school: "" });
    this.applyGroups();
  },
  clearHost() {
    this.setData({ hostKind: "", companyName: "", school: "" });
    this.applyGroups();
  },
  setHost(e) {
    const kind = e.currentTarget.dataset.kind || "";
    if (this.data.hostKind === kind) {
      this.clearHost();
      return;
    }
    this.setData({
      hostKind: kind,
      companyName: kind === "company" ? this.data.companyName : "",
      school: kind === "campus" ? this.data.school : "",
    });
    this.applyGroups();
  },
  setCompany(e) {
    const name = e.currentTarget.dataset.name || "";
    this.setData({ companyName: this.data.companyName === name ? "" : name });
    this.applyGroups();
  },
  clearCompany() {
    this.setData({ companyName: "" });
    this.applyGroups();
  },
  setSchool(e) {
    const name = e.currentTarget.dataset.name || "";
    this.setData({ school: this.data.school === name ? "" : name });
    this.applyGroups();
  },
  clearSchool() {
    this.setData({ school: "" });
    this.applyGroups();
  },
  pickMonth(e) {
    const key = e.currentTarget.dataset.key;
    if (!departureMonths().some((month) => month.key === key)) return;
    this.setData({ monthKey: key, monthPicked: true, date: "", festivalKey: "", timePreset: "any" });
    this.applyGroups();
  },
  goGroup(e) {
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + e.currentTarget.dataset.id });
  },
  onHeroChange(e) {
    this.setData({ heroIndex: Number(e.detail.current) || 0 });
  },
  goSlide(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!Number.isInteger(id) || id <= 0) return;
    wx.navigateTo({ url: detailUrl(id) });
  },
  goCurrentSlide() {
    const slides = (this.data.home.brand && this.data.home.brand.slides) || [];
    const slide = slides[this.data.heroIndex] || slides[0];
    const id = Number(slide && slide.routeId);
    if (!Number.isInteger(id) || id <= 0) return;
    wx.navigateTo({ url: detailUrl(id) });
  },
  goPublish(e) {
    const kind = e && e.currentTarget && e.currentTarget.dataset.kind;
    const url = "/pages/publish/publish" + (kind ? "?organizer=" + encodeURIComponent(kind) : "");
    const app = getApp();
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent(url) });
      return;
    }
    wx.navigateTo({ url });
  },
  goRouteApply() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/route-apply/route-apply") });
      return;
    }
    wx.navigateTo({ url: "/pages/route-apply/route-apply" });
  },
  loadUpcoming() {
    const app = getApp();
    if (!app.globalData.token) {
      this.setData({ upcoming: null });
      return;
    }
    request("/me/trips")
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        this.setData({ upcoming: list[0] || null });
      })
      .catch(() => this.setData({ upcoming: null }));
  },
  goUpcoming() {
    wx.switchTab({ url: "/pages/orders/orders" });
  },
  goOfficial() {
    wx.navigateTo({ url: "/pages/official/official" });
  },
  goDiscover() {
    wx.navigateTo({ url: "/pages/discover/discover" });
  },
  goStudent() {
    const app = getApp();
    const url = "/pages/student/student";
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent(url) });
      return;
    }
    wx.navigateTo({ url });
  },
});
