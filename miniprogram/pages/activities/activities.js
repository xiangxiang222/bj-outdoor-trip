const { request } = require("../../utils/request");
const { KINDS, isThisWeek, decorate } = require("../../utils/activity-kind");
const { decorateFeed } = require("../../utils/feed-card");
const { cycleSort, processFeed, sortLabel } = require("../../utils/feed-list");

Page({
  data: { rows: [], list: [], kinds: KINDS, kind: "", weekCount: 0, query: "", sort: "soon", sortText: "即将出发", picked: [] },
  onShow() {
    request("/schedules?channel=activity")
      .then((r) => {
        const rows = ((r && r.data) || []).map((s) => decorateFeed(decorate(s), "activity"));
        this.setData({ rows, weekCount: processFeed(rows, { channel: "activity" }).filter((s) => isThisWeek(s.startDate)).length });
        this.apply();
      })
      .catch(() => this.setData({ rows: [], list: [], weekCount: 0 }));
  },
  apply() {
    const kind = this.data.kind;
    let list = processFeed(this.data.rows, { channel: "activity", query: this.data.query, sort: this.data.sort });
    if (kind) list = list.filter((s) => s.kindLabel === kind);
    const picked = [];
    if (String(this.data.query || "").trim()) picked.push({ key: "q", label: "搜 " + String(this.data.query).trim() });
    if (this.data.sort !== "soon") picked.push({ key: "sort", label: sortLabel(this.data.sort) });
    this.setData({ list, picked, sortText: sortLabel(this.data.sort) });
  },
  onQuery(e) {
    this.setData({ query: e.detail.value || "" });
    this.apply();
  },
  cycleSort() {
    this.setData({ sort: cycleSort(this.data.sort) });
    this.apply();
  },
  setKind(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ kind: this.data.kind === key ? "" : key });
    this.apply();
  },
  clearPick(e) {
    const key = e.currentTarget.dataset.key;
    if (key === "q") this.setData({ query: "" });
    if (key === "sort") this.setData({ sort: "soon" });
    this.apply();
  },
  go(e) {
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + e.currentTarget.dataset.id });
  },
  goPublish() {
    const app = getApp();
    const kind = this.data.kind;
    const url = "/pages/publish/publish?channel=activity" + (kind ? "&kind=" + encodeURIComponent(kind) : "");
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent(url) });
      return;
    }
    wx.navigateTo({ url });
  },
});
