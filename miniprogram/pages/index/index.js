const { request } = require("../../utils/request");
const { isDark } = require("../../utils/appearance");
const { OFFER_TYPES } = require("../../utils/offer");
const { absMedia, detailUrl, normalizeLegacyMedia, withAbsSlides } = require("../../utils/media");
const { decorateFeed } = require("../../utils/feed-card");
const { cycleSort, hostFacets, processFeed, sortLabel } = require("../../utils/feed-list");
const { loadRouteCatalog, loadRoutePreferences, preferenceView } = require("../../utils/route-catalog");
const { ROUTE_MODES, readRouteMode, saveRouteMode } = require("../../utils/route-presentation");
const { chinaDay, departureMonths, availableDepartures, buildDepartureMonth, matchesDepartureTime } = require("../../utils/departure-dates");
const { createPageScroller } = require("../../utils/page-scroll");
function asList(rows) {
  return Array.isArray(rows) && rows.length ? rows : [];
}
const HERO_PHOTOS = ["mutianyu_06", "wuling_07", "beidaihe"].map((name) => absMedia("/static/photos/" + name + ".jpg"));
const DESTINATIONS = [
  { preference: "great-wall", preferenceName: "长城", name: "在长城，追一场山风", en: "WALK INTO THE WILD", tag: "山脊漫步", copy: "把辽阔，装进行程", photo: absMedia("/static/photos/mutianyu.jpg") },
  { preference: "hiking", preferenceName: "徒步登山", name: "山深处，有好风景", en: "FIND YOUR OWN PACE", tag: "山野徒步", copy: "慢下来，听山野说话", photo: absMedia("/static/photos/wuling_07.jpg") },
  { preference: "coast", preferenceName: "海边", name: "去海边，等风也等你", en: "MEET BY THE SEA", tag: "海岸出走", copy: "有些放松，只需一片海", photo: absMedia("/static/photos/beidaihe.jpg") },
];
function heroSlides(home) {
  const slides = withAbsSlides(home && home.brand && home.brand.slides).filter((slide) => slide.url);
  return slides.length ? slides : HERO_PHOTOS.map((url) => ({ url }));
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
    heroSlides: heroSlides(),
    destinations: DESTINATIONS,
    hotWords: ["长城", "古北水镇", "徒步", "草原"],
    statusBarHeight: 24,
    navHeight: 44,
    navRight: 108,
    homeDark: false,
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
    routePreference: "",
    routePreferences: [],
    routePrimaryPreferences: [],
    routeMorePreferences: [],
    routeMoreOpen: false,
    routePreferenceTotal: null,
    routePreferenceLoading: true,
    routePreferenceErr: "",
    routePreferenceScroll: "route-pref-all",
    routePicked: [],
    routeList: [],
    routeErr: "",
    routeErrCode: "",
    routeLoading: false,
    routeMode: "poster",
    routeModes: ROUTE_MODES,
    routeDark: false,
    loading: true,
  },
  onLoad() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const statusBarHeight = info.statusBarHeight || 24;
      const capsule = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
      const validCapsule = capsule && capsule.height > 0 && capsule.top >= statusBarHeight;
      this.setData({
        statusBarHeight,
        navHeight: validCapsule ? (capsule.top - statusBarHeight) * 2 + capsule.height : 44,
        navRight: validCapsule && info.windowWidth > capsule.left ? info.windowWidth - capsule.left + 12 : 108,
      });
    } catch (e) {}
    const cached = normalizeLegacyMedia(wx.getStorageSync("bj_home_cache"));
    if (cached && cached.home) {
      const allSchedules = asList(cached.schedules);
      this.setData({
        loading: false,
        home: cached.home,
        heroSlides: heroSlides(cached.home),
        allSchedules,
      });
      this.applyGroups();
    }
    this.loadPreferences();
    this.load();
  },
  onShow() {
    this._homeHidden = false;
    this._routeUnloaded = false;
    this.setData({ routeMode: readRouteMode(), routeDark: isDark(), homeDark: isDark() });
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
    Promise.all([this.load(), this.loadPreferences(true)]).then(() => wx.stopPullDownRefresh());
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
    if (this.data.view !== "trips") this.setView({ currentTarget: { dataset: { view: "trips" } } });
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
        heroSlides: heroSlides(home),
        heroIndex: 0,
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
  onHide() { this._homeHidden = true; this.cancelExplore(); },
  onUnload() { this._homeHidden = true; this.cancelExplore(); clearTimeout(this._searchTimer); this._routeUnloaded = true; this._routeRequestId = (this._routeRequestId || 0) + 1; this._preferenceRequestId = (this._preferenceRequestId || 0) + 1; },
  homeIsActive() {
    if (this._homeHidden || this._routeUnloaded) return false;
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    return !pages.length || pages[pages.length - 1] === this;
  },
  homeScroller() {
    if (!this._homeScroller) this._homeScroller = createPageScroller({
      scrollTo: (options) => wx.pageScrollTo(options),
      isActive: () => this.homeIsActive(),
    });
    return this._homeScroller;
  },
  cancelExplore() {
    this._exploreVersion = (this._exploreVersion || 0) + 1;
    if (this._homeScroller) this._homeScroller.cancel();
  },
  navigateHome(method, url) {
    this.cancelExplore();
    const navigate = () => {
      if (this.homeIsActive()) wx[method]({ url });
    };
    if (this._homeScroller) this._homeScroller.whenIdle(navigate);
    else navigate();
  },
  explore() {
    this.cancelExplore();
    const version = this._exploreVersion;
    const scroller = this.homeScroller();
    const active = () => version === this._exploreVersion && this.homeIsActive();
    // Measure after the chosen catalog and its filters have reached the view.
    scroller.whenIdle(() => wx.nextTick(() => {
      if (!active()) return;
      wx.createSelectorQuery().select("#explore").boundingClientRect().selectViewport().scrollOffset().exec(([rect, viewport]) => {
        if (!active() || !rect || !viewport) return;
        const inset = this.data.statusBarHeight + this.data.navHeight + 12;
        const distance = rect.top - inset;
        if (Math.abs(distance) < 24) return;
        const duration = Math.min(900, Math.max(400, Math.round(360 + Math.abs(distance) * 0.4)));
        scroller.start({ from: viewport.scrollTop, to: Math.max(0, viewport.scrollTop + distance), duration });
      });
    }));
  },
  discoverTrips() {
    clearTimeout(this._searchTimer);
    if (this.data.view === "routes") this.loadRoutes();
    else this.applyGroups();
    this.explore();
  },
  discoverJourney() {
    clearTimeout(this._searchTimer);
    this.setView({ currentTarget: { dataset: { view: "trips" } } });
    this.applyGroups();
    this.explore();
  },
  searchDestination(e) {
    const keyword = String(e.currentTarget.dataset.keyword || "").trim();
    if (!keyword) return;
    clearTimeout(this._searchTimer);
    this.setData({ query: keyword, routePreference: "" });
    this.setView({ currentTarget: { dataset: { view: "routes" } } });
    this.explore();
  },
  discoverInspiration(e) {
    const preference = e.currentTarget.dataset.preference;
    if (!this.data.destinations.some((place) => place.preference === preference)) return;
    clearTimeout(this._searchTimer);
    this.setData({ routePreference: preference });
    this.refreshPreferenceView();
    this.setView({ currentTarget: { dataset: { view: "routes" } } });
    this.explore();
  },
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
      searchHint: view === "routes" ? "搜长城 / 十渡 / 坝上" : "搜线路、城区、主理人",
    });
    if (view === "routes") this.loadRoutes();
  },
  setRoutePreference(e) {
    const preference = e.currentTarget.dataset.preference || "";
    if (preference && !this.data.routePreferences.some((option) => option.key === preference)) return;
    if (preference === this.data.routePreference) return;
    clearTimeout(this._searchTimer);
    this.setData({ routePreference: preference });
    this.refreshPreferenceView();
    return this.loadRoutes();
  },
  toggleRoutePreferences() {
    this.setData({ routeMoreOpen: !this.data.routeMoreOpen });
    this.refreshPreferenceView();
  },
  refreshPreferenceView() {
    const previousName = this._selectedPreferenceName && this._selectedPreferenceName.key === this.data.routePreference ? this._selectedPreferenceName.name : "";
    const view = preferenceView(this.data.routePreferences, this.data.routePreference, this.data.routeMoreOpen, previousName);
    this._selectedPreferenceName = { key: this.data.routePreference, name: view.selectedName };
    const name = view.selectedName || this.data.routePreference;
    const routePicked = [];
    if (this.data.routePreference) routePicked.push({ key: "preference", type: "偏好", value: name });
    const q = String(this.data.query || "").trim();
    if (q) routePicked.push({ key: "q", type: "关键词", value: q });
    if (this.data.routeDays) routePicked.push({ key: "days", type: "天数", value: this.data.routeDays === "multi" ? "4日及以上" : this.data.routeDays + "日" });
    const preference = this.data.routePreference;
    this.setData({ routePrimaryPreferences: view.primary, routeMorePreferences: view.more, routePicked, routePreferenceScroll: "" });
    const reveal = () => {
      if (!this._routeUnloaded && this.data.routePreference === preference) this.setData({ routePreferenceScroll: "route-pref-" + (preference || "all") });
    };
    if (wx.nextTick) wx.nextTick(reveal);
    else reveal();
  },
  loadPreferences(force = false) {
    const filters = { q: String(this.data.query || "").trim(), days: this.data.routeDays };
    const base = JSON.stringify(filters);
    if (!force && this._preferenceBase === base) {
      if (this._preferencePromise) return this._preferencePromise;
      if (this._preferenceReady) return Promise.resolve();
    }
    const requestId = this._preferenceRequestId = (this._preferenceRequestId || 0) + 1;
    this._preferenceBase = base;
    this._preferenceReady = false;
    this.setData({ routePreferences: this.data.routePreferences.map((option) => ({ ...option, count: null })), routePreferenceLoading: true, routePreferenceErr: "", routePreferenceTotal: null });
    this.refreshPreferenceView();
    const task = (async () => {
      try {
        const data = await loadRoutePreferences(filters);
        if (data.err) throw new Error(data.err);
        if (this._routeUnloaded || requestId !== this._preferenceRequestId) return;
        this._preferenceReady = true;
        this.setData({ routePreferences: data.options, routePreferenceTotal: data.total,
          routePreferenceLoading: false, routePreferenceErr: "",
          destinations: DESTINATIONS.filter((place) => data.options.some((option) => option.key === place.preference))
            .map((place) => ({ ...place, preferenceName: data.options.find((option) => option.key === place.preference).name })),
        });
        this.refreshPreferenceView();
      } catch (e) {
        if (this._routeUnloaded || requestId !== this._preferenceRequestId) return;
        this.setData({ routePreferenceLoading: false, routePreferenceErr: (e && e.message) || "偏好数量暂时加载失败", routePreferenceTotal: null });
      } finally {
        if (requestId === this._preferenceRequestId) this._preferencePromise = null;
      }
    })();
    this._preferencePromise = task;
    return task;
  },
  reloadRoutePreferences() { return this.loadPreferences(true); },
  setRouteDays(e) {
    const d = e.currentTarget.dataset.d;
    this.setData({ routeDays: d === "multi" ? "multi" : Number(d) });
    return this.loadRoutes();
  },
  setRouteMode(e) {
    const value = e.currentTarget.dataset.mode;
    if (!ROUTE_MODES.some((mode) => mode.key === value)) return;
    this.setData({ routeMode: saveRouteMode(value) });
  },
  clearRouteFilters() {
    clearTimeout(this._searchTimer);
    this.setData({ routePreference: "", routeDays: 0, query: "" });
    return this.loadRoutes();
  },
  clearRouteFilter(e) {
    const field = { preference: "routePreference", q: "query", days: "routeDays" }[e.currentTarget.dataset.key];
    if (!field) return;
    clearTimeout(this._searchTimer);
    this.setData({ [field]: field === "routeDays" ? 0 : "" });
    return this.loadRoutes();
  },
  onRouteImageError(e) {
    const id = Number(e.currentTarget.dataset.id);
    const index = this.data.routeList.findIndex((item) => Number(item.id) === id);
    if (index >= 0) this.setData({ ["routeList[" + index + "].imageBroken"]: true });
  },
  async loadRoutes() {
    const requestId = this._routeRequestId = (this._routeRequestId || 0) + 1;
    const filters = { preference: this.data.routePreference, q: String(this.data.query || "").trim(), days: this.data.routeDays };
    this.refreshPreferenceView();
    this.setData({ routeLoading: true, routeErr: "", routeErrCode: "" });
    const preferences = this.loadPreferences();
    try {
      const { list, err, code = "" } = await loadRouteCatalog(filters);
      if (this._routeUnloaded || requestId !== this._routeRequestId) return;
      this.setData({ ...(code === "ROUTE_PREFERENCE_UNAVAILABLE" ? { routeList: [] } : err ? {} : { routeList: list }), routeErr: err, routeErrCode: code, routeLoading: false });
      if (code === "ROUTE_PREFERENCE_UNAVAILABLE") await this.loadPreferences(true);
    } catch (e) {
      if (this._routeUnloaded || requestId !== this._routeRequestId) return;
      this.setData({ routeErr: (e && e.message) || "加载失败", routeLoading: false });
    }
    await preferences;
  },
  goRoute(e) {
    this.navigateHome("navigateTo", detailUrl(e.currentTarget.dataset.id));
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
    this.navigateHome("navigateTo", "/pages/schedule/schedule?id=" + e.currentTarget.dataset.id);
  },
  onHeroChange(e) {
    this.setData({ heroIndex: Number(e.detail.current) || 0 });
  },
  selectHero(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (Number.isInteger(index) && index >= 0 && index < this.data.heroSlides.length) this.setData({ heroIndex: index });
  },
  onHeroError(e) {
    const index = Number(e.currentTarget.dataset.index);
    const slides = this.data.heroSlides.slice();
    const slide = slides[index];
    if (!slide || slide.imageBroken) return;
    const fallback = HERO_PHOTOS[index % HERO_PHOTOS.length];
    slides[index] = slide.url !== fallback && !slide.fallbackUsed
      ? { ...slide, url: fallback, fallbackUsed: true }
      : { ...slide, imageBroken: true };
    this.setData({ heroSlides: slides });
  },
  goSlide(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!Number.isInteger(id) || id <= 0) return;
    this.navigateHome("navigateTo", detailUrl(id));
  },
  goCurrentSlide() {
    const slides = this.data.heroSlides;
    const slide = slides[this.data.heroIndex] || slides[0];
    const id = Number(slide && slide.routeId);
    if (!Number.isInteger(id) || id <= 0) return;
    this.navigateHome("navigateTo", detailUrl(id));
  },
  goPublish(e) {
    const kind = e && e.currentTarget && e.currentTarget.dataset.kind;
    const url = "/pages/publish/publish" + (kind ? "?organizer=" + encodeURIComponent(kind) : "");
    const app = getApp();
    if (!app.globalData.token) {
      this.navigateHome("navigateTo", "/pages/login/login?redirect=" + encodeURIComponent(url));
      return;
    }
    this.navigateHome("navigateTo", url);
  },
  goGuides() {
    this.navigateHome("navigateTo", "/pages/guides/guides");
  },
  goRouteApply() {
    const app = getApp();
    if (!app.globalData.token) {
      this.navigateHome("navigateTo", "/pages/login/login?redirect=" + encodeURIComponent("/pages/route-apply/route-apply"));
      return;
    }
    this.navigateHome("navigateTo", "/pages/route-apply/route-apply");
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
    this.navigateHome("switchTab", "/pages/orders/orders");
  },
  goOfficial() {
    this.navigateHome("navigateTo", "/pages/official/official");
  },
  goDiscover() {
    this.navigateHome("navigateTo", "/pages/discover/discover");
  },
  goStudent() {
    const app = getApp();
    const url = "/pages/student/student";
    if (!app.globalData.token) {
      this.navigateHome("navigateTo", "/pages/login/login?redirect=" + encodeURIComponent(url));
      return;
    }
    this.navigateHome("navigateTo", url);
  },
});
