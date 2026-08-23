const { request } = require("../../utils/request");
const lite = require("../../data/routes-lite");
const { withLocalMediaList, detailUrl } = require("../../utils/media");
const { OFFER_TYPES, countOn, buildCalendar } = require("../../utils/offer");

function asList(rows) {
  return Array.isArray(rows) && rows.length ? rows : [];
}

Page({
  data: {
    home: { brand: { kicker: "北野行", lead: "说走就走的京郊山野", gallery: [] }, cities: [], tags: [], festivals: [], months: [], durations: [] },
    theme: null,
    groups: [],
    weekend: [],
    err: "",
    upcoming: null,
    calendar: [],
    allSchedules: [],
    guides: [],
    city: "",
    cityGallery: [],
    citySlides: [],
    monthKey: "",
    monthDays: [],
    festivalKey: "",
    festivalDates: [],
    offers: OFFER_TYPES,
    offerFilter: "",
  },
  onLoad() {
    this.applyRoutes(asList(lite));
    this.load();
  },
  onShow() {
    this.loadUpcoming();
  },
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },
  applyRoutes(rows) {
    const raw = withLocalMediaList(asList(rows));
    const theme = raw.find((r) => r.days === 3) || raw.find((r) => r.days === 2) || raw[0] || null;
    const weekend = raw.filter((r) => r.days === 1).slice(0, 4);
    this.setData({ theme, weekend, err: raw.length ? "" : "暂无线路" });
  },
  applyGroups() {
    const offerFilter = this.data.offerFilter;
    const groups = (this.data.allSchedules || [])
      .filter((s) => s.status !== "cancelled" && Number(s.remain) > 0)
      .filter((s) => !offerFilter || s.offerType === offerFilter)
      .slice(0, 6);
    this.setData({ groups });
  },
  async load() {
    try {
      const [homeRes, routesRes, schRes, guideRes] = await Promise.all([
        request("/home").catch(() => ({ data: {} })),
        request("/routes"),
        request("/schedules").catch(() => ({ data: [] })),
        request("/guides").catch(() => ({ data: [] })),
      ]);
      const home = homeRes.data || {};
      if (home.brand && !Array.isArray(home.brand.slides)) {
        home.brand.slides = (home.brand.gallery || []).map((url) => ({ url, routeId: 0, title: "" }));
      }
      const firstCity = home.cities && home.cities[0];
      const city = firstCity ? firstCity.name : "";
      const rows = asList(routesRes.data);
      if (rows.length) this.applyRoutes(rows);
      else if (!this.data.theme) this.applyRoutes(asList(lite));
      const allSchedules = asList(schRes.data);
      this.setData({
        home,
        city,
        citySlides: (firstCity && firstCity.slides) || [],
        cityGallery: (firstCity && firstCity.gallery) || [],
        monthKey: (home.months && home.months[0] && home.months[0].key) || "",
        monthDays: home.monthDays || [],
        allSchedules,
        calendar: buildCalendar(allSchedules),
        guides: asList(guideRes.data)
          .slice(0, 4)
          .map((g) => Object.assign({}, g, { initial: String(g.name || "导").slice(0, 1) })),
      });
      this.applyGroups();
      await this.loadUpcoming();
    } catch (err) {
      if (!this.data.theme) this.applyRoutes(asList(lite));
      if (!this.data.theme) this.setData({ err: (err && err.message) || "加载失败" });
    }
  },
  setCity(e) {
    const name = e.currentTarget.dataset.name;
    const hit = (this.data.home.cities || []).find((c) => c.name === name);
    this.setData({
      city: name,
      citySlides: (hit && hit.slides) || [],
      cityGallery: (hit && hit.gallery) || [],
    });
  },
  setOffer(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ offerFilter: this.data.offerFilter === key ? "" : key });
    this.applyGroups();
  },
  setFestival(e) {
    const key = e.currentTarget.dataset.key;
    const on = this.data.festivalKey === key ? "" : key;
    const f = (this.data.home.festivals || []).find((x) => x.key === on);
    this.setData({ festivalKey: on, festivalDates: (f && f.dates) || [] });
  },
  async pickMonth(e) {
    const key = e.currentTarget.dataset.key;
    const res = await request("/home?month=" + key);
    this.setData({ monthKey: key, monthDays: (res.data && res.data.monthDays) || [] });
  },
  goDays(e) {
    const app = getApp();
    app.globalData.routeFilter = { days: e.currentTarget.dataset.days, tag: "" };
    wx.switchTab({ url: "/pages/routes/routes" });
  },
  goPlace(e) {
    const app = getApp();
    app.globalData.routeFilter = { days: 0, tag: e.currentTarget.dataset.c };
    wx.switchTab({ url: "/pages/routes/routes" });
  },
  goTheme() {
    const id = this.data.theme && this.data.theme.id;
    if (id) wx.navigateTo({ url: detailUrl(id) });
  },
  goRoute(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: detailUrl(id) });
  },
  goGroup(e) {
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + e.currentTarget.dataset.id });
  },
  goChain() {
    wx.switchTab({ url: "/pages/chain/chain" });
  },
  goAllOneDay() {
    const app = getApp();
    app.globalData.routeFilter = { days: 1, tag: "" };
    wx.switchTab({ url: "/pages/routes/routes" });
  },
  goPublish(date) {
    const app = getApp();
    const q = typeof date === "string" ? "?date=" + date : "";
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/publish/publish" + q) });
      return;
    }
    wx.navigateTo({ url: "/pages/publish/publish" + q });
  },
  goGuides() {
    wx.navigateTo({ url: "/pages/guides/guides" });
  },
  goGuide(e) {
    wx.navigateTo({ url: "/pages/guide/guide?id=" + e.currentTarget.dataset.id });
  },
  goMember() {
    wx.navigateTo({ url: "/pages/member/member" });
  },
  async loadUpcoming() {
    const app = getApp();
    if (!app.globalData.token) {
      this.setData({ upcoming: null });
      return;
    }
    try {
      const res = await request("/me/trips");
      const list = asList(res.data);
      this.setData({ upcoming: list[0] || null });
    } catch (err) {
      this.setData({ upcoming: null });
    }
  },
  goUpcoming() {
    const u = this.data.upcoming;
    if (u && u.scheduleId) wx.navigateTo({ url: "/pages/schedule/schedule?id=" + u.scheduleId });
  },
  goFestivalDay(e) {
    this.goDay({ currentTarget: { dataset: { date: e.currentTarget.dataset.date, count: countOn(this.data.allSchedules, e.currentTarget.dataset.date) } } });
  },
  goDay(e) {
    const date = e.currentTarget.dataset.date;
    const count = Number(e.currentTarget.dataset.count || 0);
    if (!count) {
      this.goPublish(date);
      return;
    }
    const hit = (this.data.allSchedules || []).find((s) => s.startDate === date && s.status !== "cancelled");
    if (hit) wx.navigateTo({ url: "/pages/schedule/schedule?id=" + hit.id });
    else wx.switchTab({ url: "/pages/chain/chain" });
  },
});
