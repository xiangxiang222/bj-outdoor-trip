const { request } = require("../../utils/request");
const { payStatusText, starText } = require("../../utils/labels");
const { shareCover } = require("../../utils/media");
const { drawWeatherChart } = require("../../utils/weather-chart");
const app = getApp();

function busLine(s) {
  const b = s && s.bus;
  if (!b) return "车型待确认";
  const bits = [b.name];
  if (b.seats) bits.push(b.seats + " 座");
  bits.push(b.plateNo ? b.plateNo : "车号待确认");
  return bits.join(" · ");
}

Page({
  data: {
    s: null,
    id: "",
    coupon: "",
    showDissolve: false,
    reason: "",
    seatRows: [],
    weather: null,
    reviews: { list: [], count: 0, avg: 0 },
    packing: [],
    cancelSummary: "",
    contacts: { officialWechat: "beiyexing", officialWechatName: "北野行官方", officialGroup: "北野行户外交流群" },
    gallery: [],
    busPhotos: [],
    busText: "",
    leaderSlots: [{ slot: 1, label: "领队1", leader: null }, { slot: 2, label: "领队2", leader: null }],
  },
  onLoad(q) {
    this.setData({ id: q.id, coupon: q.coupon || "" });
    wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
  },
  onShow() { this.load(); },
  load() {
    request("/schedules/" + this.data.id).then((r) => {
      const s = r.data;
      if (s && s.chain) {
        s.chain = s.chain.map((c) => Object.assign({}, c, { payText: payStatusText(c.payStatus) }));
      }
      this.setData({
        s,
        packing: (s.route && s.route.packingList) || [],
        gallery: (s.gallery && s.gallery.length ? s.gallery : (s.route && s.route.cover ? [s.route.cover] : [])),
        busPhotos: (s.bus && s.bus.photos) || [],
        busText: busLine(s),
        leaderSlots: [1, 2].map((slot) => ({
          slot,
          label: "领队" + slot,
          leader: ((s.leaders || []).find((l) => Number(l.slot) === slot)) || null,
        })),
      });
      const region = s && s.route && [s.route.region, s.route.title].filter(Boolean).join(" ");
      const date = s && s.startDate;
      if (region) {
        request("/weather?region=" + encodeURIComponent(region) + "&date=" + (date || "")).then((w) => {
          this.setData({ weather: w.data }, () => {
            wx.nextTick(() => this.drawWeather());
          });
        }).catch(() => {});
      }
    });
    request("/schedules/" + this.data.id + "/seats").then((r) => {
      const seats = (r.data && r.data.seats) || [];
      const groups = [];
      seats.forEach((seat) => {
        const last = groups[groups.length - 1];
        if (!last || last.row !== seat.row) groups.push({ row: seat.row, seats: [seat] });
        else last.seats.push(seat);
      });
      this.setData({ seatRows: groups });
    }).catch(() => {});
    request("/schedules/" + this.data.id + "/reviews").then((r) => {
      const data = (r && r.data) || {};
      const list = (data.list || []).map((row) => Object.assign({}, row, { stars: starText(row.rating) }));
      this.setData({ reviews: { list, count: data.count || 0, avg: data.avg || 0 } });
    }).catch(() => {});
    request("/meta").then((r) => {
      const data = (r && r.data) || {};
      this.setData({
        cancelSummary: (data.cancelPolicy && data.cancelPolicy.summary) || "",
        contacts: data.contacts || this.data.contacts,
      });
    }).catch(() => {});
  },
  openMap() {
    const s = this.data.s;
    if (!s) return;
    if (s.meetupLat && s.meetupLng) {
      wx.openLocation({
        latitude: Number(s.meetupLat),
        longitude: Number(s.meetupLng),
        name: s.meetupPoint || "集合点",
        address: s.meetupPoint || "",
        scale: 16,
      });
      return;
    }
    const point = s.meetupPoint;
    if (!point) return;
    wx.setClipboardData({
      data: point,
      success: () => wx.showToast({ title: "已复制集合点", icon: "none" }),
    });
  },
  previewHero(e) {
    const urls = this.data.gallery || [];
    if (!urls.length) return;
    wx.previewImage({ urls, current: e.currentTarget.dataset.src || urls[0] });
  },
  previewBus() {
    const urls = this.data.busPhotos || [];
    if (!urls.length) return;
    wx.previewImage({ urls, current: urls[0] });
  },
  drawWeather() {
    const hourly = this.data.weather && this.data.weather.hourly;
    if (!hourly || !hourly.length) return;
    wx.createSelectorQuery().in(this)
      .select("#weatherChart")
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res && res[0];
        if (!info || !info.node) return;
        drawWeatherChart(info.node, info.width, info.height, hourly);
      });
  },
  goUser(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: "/pages/user/user?id=" + id });
  },
  onSeat(e) {
    const id = e.currentTarget.dataset.userid;
    if (id) {
      wx.navigateTo({ url: "/pages/user/user?id=" + id });
      return;
    }
    if (e.currentTarget.dataset.locked || e.currentTarget.dataset.taken) return;
    const mine = this.data.s && this.data.s.myEnrollment;
    if (mine && mine.status === "joined") {
      request("/schedules/" + this.data.id + "/seats/pick", "POST", { seatNo: e.currentTarget.dataset.no }).then(() => {
        wx.showToast({ title: "已选座", icon: "none" });
        this.load();
      }).catch((err) => wx.showToast({ title: err.message || "选座失败", icon: "none" }));
      return;
    }
    wx.showToast({ title: "早报名早选座", icon: "none" });
  },
  applyLeader() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/schedule/schedule?id=" + this.data.id) });
      return;
    }
    request("/schedules/" + this.data.id + "/leaders/apply", "POST", {}).then(() => {
      wx.showToast({ title: "已报名领队", icon: "none" });
      this.load();
    }).catch((e) => wx.showModal({ title: "报名领队失败", content: e.message, showCancel: false }));
  },
  openLeader(e) {
    const kind = e.currentTarget.dataset.kind;
    const id = e.currentTarget.dataset.id;
    const userId = e.currentTarget.dataset.userid;
    if (kind === "guide" && id) wx.navigateTo({ url: "/pages/guide/guide?id=" + id });
    else if (userId || id) wx.navigateTo({ url: "/pages/user/user?id=" + (userId || id) });
  },
  async payFor(e) {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/schedule/schedule?id=" + this.data.id) });
      return;
    }
    try {
      await request("/pay/for-enrollment", "POST", { enrollmentId: e.currentTarget.dataset.id });
      wx.showToast({ title: "已支付（演示）", icon: "none" });
      this.load();
    } catch (err) {
      wx.showModal({ title: "支付失败", content: err.message, showCancel: false });
    }
  },
  copyText(e) {
    const text = e.currentTarget.dataset.text;
    if (!text) return;
    wx.setClipboardData({ data: String(text), success: () => wx.showToast({ title: "已复制", icon: "none" }) });
  },
  enroll() {
    let url = "/pages/enroll/enroll?id=" + this.data.id;
    if (this.data.coupon) url += "&coupon=" + this.data.coupon;
    wx.navigateTo({ url });
  },
  goCoupon() {
    const c = this.data.s && this.data.s.coupon;
    if (c && c.code) wx.navigateTo({ url: "/pages/coupon/coupon?code=" + c.code });
  },
  goGuide() {
    const g = this.data.s && this.data.s.guide;
    if (g && g.id) wx.navigateTo({ url: "/pages/guide/guide?id=" + g.id });
  },
  stats() { wx.navigateTo({ url: "/pages/stats/stats?id=" + this.data.id }); },
  toggleDissolve() { this.setData({ showDissolve: !this.data.showDissolve }); },
  setReason(e) { this.setData({ reason: e.detail.value }); },
  async confirmDissolve() {
    const reason = (this.data.reason || "").trim();
    if (!reason) {
      wx.showToast({ title: "请填写解散理由", icon: "none" });
      return;
    }
    try {
      const res = await request("/schedules/" + this.data.id + "/dissolve", "POST", { reason });
      this.setData({ showDissolve: false, reason: "" });
      wx.showModal({
        title: "已解散",
        content: "取消 " + res.data.cancelled + " 人，退款 " + res.data.refunded + " 人，短信 " + res.data.smsCount + " 条",
        showCancel: false,
      });
      this.load();
    } catch (e) {
      wx.showModal({ title: "解散失败", content: e.message, showCancel: false });
    }
  },
  onShareAppMessage() {
    const s = this.data.s;
    const title = s && s.route
      ? (s.organizerName || "北野行") + "邀请你报名「" + s.route.title + "」"
      : "北野行 · 一起出发";
    return {
      title,
      path: "/pages/schedule/schedule?id=" + this.data.id,
      imageUrl: shareCover(s && s.route && s.route.cover),
    };
  },
  onShareTimeline() {
    const s = this.data.s;
    return {
      title: (s && s.route && s.route.title) || "北野行",
      query: "id=" + this.data.id,
    };
  },
});
