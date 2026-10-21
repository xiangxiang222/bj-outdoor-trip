const { request } = require("../../utils/request");
const { decorateFeed } = require("../../utils/feed-card");
const { processFeed } = require("../../utils/feed-list");

Page({
  data: {
    trips: [],
    ready: false,
    missing: false,
  },
  onLoad(query) {
    const raw = (query && (query.code || query.scene)) || "";
    let code = String(raw);
    try {
      code = decodeURIComponent(code);
    } catch (e) {}
    this.code = code;
    this.load();
  },
  load() {
    if (!this.code) {
      this.setData({ ready: true, missing: true, trips: [] });
      return;
    }
    request("/poster-lineups/" + encodeURIComponent(this.code))
      .then((res) => {
        const trips = processFeed((res.data && res.data.trips) || [], { sort: "soon" }).map((row) => decorateFeed(row));
        this.setData({ ready: true, missing: !trips.length, trips });
      })
      .catch(() => {
        this.setData({ ready: true, missing: true, trips: [] });
      });
  },
  go(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + id });
  },
});
