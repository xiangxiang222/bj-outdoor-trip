const { request } = require("../../utils/request");
const { OFFER_TYPES, buildCalendar } = require("../../utils/offer");
const { detailUrl } = require("../../utils/media");
const { decorateFeed } = require("../../utils/feed-card");
const { cycleSort, processFeed, sortLabel } = require("../../utils/feed-list");
const { loadRouteCatalog } = require("../../utils/route-catalog");

function asList(rows) {
  return Array.isArray(rows) && rows.length ? rows : [];
}

Page({
  data: {
    heroIndex: 0,
    home: { brand: { kicker: "同行者众", lead: "在山野，遇见爱", slides: [] }, cities: [], tags: [], festivals: [], months: [] },
    groups: [],
    allSchedules: [],
    calendar: [],
    city: "",
    date: "",
    tag: "",
    monthKey: "",
    monthPicked: false,
    monthDays: [],
    festivalKey: "",
    offerFilter: "",
    offers: OFFER_TYPES.filter((o) => o.key !== "full"),
    fold: { extra: false },
    picked: [],
    upcoming: null,
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
  },
  onLoad() {
    this.load();
  },
  onShow() {
    const app = getApp();
    if (app.globalData.homeView === "routes") {
      app.globalData.homeView = "";
      this.setView({ currentTarget: { dataset: { view: "routes" } } });
    }
  },
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },
  applyGroups() {
    const { city, date, tag, offerFilter, festivalKey, home, allSchedules, query, sort, monthKey, monthPicked } = this.data;
    const fest = (home.festivals || []).find((f) => f.key === festivalKey);
    const festDates = new Set(((fest && fest.dates) || []).map((d) => d.date));
    const groups = processFeed(allSchedules, {
      query,
      sort,
      city,
      tag,
      date,
      festivalDates: festivalKey ? festDates : null,
      offerFilter,
      monthKey,
      monthPicked,
      channel: "trip",
    }).map((s) => decorateFeed(s));
    const picked = [];
    if (city) picked.push({ key: "city", label: city });
    if (date) picked.push({ key: "date", label: date.slice(5) });
    if (monthPicked && !date && monthKey) picked.push({ key: "month", label: monthKey.slice(5) + "月" });
    if (festivalKey && fest) picked.push({ key: "fest", label: fest.name });
    if (tag) picked.push({ key: "tag", label: tag });
    if (offerFilter) {
      const o = this.data.offers.find((x) => x.key === offerFilter);
      if (o) picked.push({ key: "offer", label: o.label });
    }
    if (String(query || "").trim()) picked.push({ key: "q", label: "搜 " + String(query).trim() });
    if (sort !== "soon") picked.push({ key: "sort", label: sortLabel(sort) });
    this.setData({ groups, picked, sortText: sortLabel(sort) });
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
        home,
        monthKey: (home.months && home.months[0] && home.months[0].key) || "",
        monthDays: home.monthDays || [],
        allSchedules,
        calendar: buildCalendar(allSchedules),
      });
      this.applyGroups();
      this.loadUpcoming();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" });
    }
  },
  onQuery(e) {
    this.setData({ query: e.detail.value || "" });
    if (this.data.view === "routes") this.loadRoutes();
    else this.applyGroups();
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
  async loadRoutes() {
    if (!this.data.routeTags.length) {
      try {
        const tagsRes = await request("/play-tags");
        this.setData({ routeTags: tagsRes.data || [] });
      } catch {
        this.setData({ routeTags: this.data.home.tags || [] });
      }
    }
    const { list, err } = await loadRouteCatalog({
      q: String(this.data.query || "").trim(),
      days: this.data.routeDays,
      tag: this.data.routeTag,
    });
    this.setData({ routeList: list, routeErr: err });
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
    this.setData({ date: this.data.date === d ? "" : d });
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
    this.setData({ festivalKey: this.data.festivalKey === key ? "" : key });
    this.applyGroups();
  },
  toggleFold(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ["fold." + key]: !this.data.fold[key] });
  },
  clearPick(e) {
    const key = e.currentTarget.dataset.key;
    if (key === "city") this.setData({ city: "" });
    if (key === "date") this.setData({ date: "" });
    if (key === "tag") this.setData({ tag: "" });
    if (key === "offer") this.setData({ offerFilter: "" });
    if (key === "fest") this.setData({ festivalKey: "" });
    if (key === "month") this.setData({ monthPicked: false });
    if (key === "q") this.setData({ query: "" });
    if (key === "sort") this.setData({ sort: "soon" });
    this.applyGroups();
  },
  async pickMonth(e) {
    const key = e.currentTarget.dataset.key;
    const res = await request("/home?month=" + key);
    this.setData({ monthKey: key, monthPicked: true, "fold.extra": true, monthDays: (res.data && res.data.monthDays) || [] });
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
  goPublish() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/publish/publish") });
      return;
    }
    wx.navigateTo({ url: "/pages/publish/publish" });
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
  goStudent() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/mine/mine") });
      return;
    }
    wx.switchTab({ url: "/pages/mine/mine" });
  },
});
