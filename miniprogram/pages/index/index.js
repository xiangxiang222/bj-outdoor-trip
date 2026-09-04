const { request } = require("../../utils/request");
const { OFFER_TYPES, countOn, buildCalendar } = require("../../utils/offer");

function asList(rows) {
  return Array.isArray(rows) && rows.length ? rows : [];
}

Page({
  data: {
    home: { brand: { kicker: "同行者众", lead: "在山野，遇见爱", slides: [] }, cities: [], tags: [], festivals: [], months: [] },
    groups: [],
    allSchedules: [],
    calendar: [],
    city: "",
    date: "",
    tag: "",
    monthKey: "",
    monthDays: [],
    festivalKey: "",
    offerFilter: "",
    offers: OFFER_TYPES.filter((o) => o.key !== "full"),
    fold: { days: true, month: false, fest: false },
    picked: [],
  },
  onLoad() {
    this.load();
  },
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },
  applyGroups() {
    const { city, date, tag, offerFilter, festivalKey, home, allSchedules } = this.data;
    const fest = (home.festivals || []).find((f) => f.key === festivalKey);
    const festDates = new Set(((fest && fest.dates) || []).map((d) => d.date));
    const groups = (allSchedules || [])
      .filter((s) => s.status !== "cancelled" && Number(s.remain) > 0)
      .filter((s) => (s.channel || "trip") !== "activity")
      .filter((s) => !city || s.city === city)
      .filter((s) => !date || s.startDate === date)
      .filter((s) => !festivalKey || !festDates.size || festDates.has(s.startDate))
      .filter((s) => !tag || (s.playTags || []).some((t) => t.name === tag))
      .filter((s) => !offerFilter || s.offerType === offerFilter);
    const picked = [];
    if (city) picked.push({ key: "city", label: city });
    if (date) picked.push({ key: "date", label: date.slice(5) });
    if (tag) picked.push({ key: "tag", label: tag });
    if (offerFilter) {
      const o = this.data.offers.find((x) => x.key === offerFilter);
      if (o) picked.push({ key: "offer", label: o.label });
    }
    this.setData({ groups, picked });
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
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" });
    }
  },
  setCity(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ city: this.data.city === name ? "" : name });
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
    this.applyGroups();
  },
  async pickMonth(e) {
    const key = e.currentTarget.dataset.key;
    const res = await request("/home?month=" + key);
    this.setData({ monthKey: key, monthDays: (res.data && res.data.monthDays) || [] });
  },
  goGroup(e) {
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + e.currentTarget.dataset.id });
  },
  goPublish() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/publish/publish") });
      return;
    }
    wx.navigateTo({ url: "/pages/publish/publish" });
  },
  goMember() {
    wx.navigateTo({ url: "/pages/member/member" });
  },
  goOfficial() {
    wx.switchTab({ url: "/pages/official/official" });
  },
  goLottery() {
    wx.navigateTo({ url: "/pages/lottery/lottery" });
  },
  goFeedback() {
    wx.navigateTo({ url: "/pages/feedback/feedback" });
  },
});
