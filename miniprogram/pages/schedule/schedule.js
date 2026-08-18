const { request } = require("../../utils/request");
const { payStatusText, starText } = require("../../utils/labels");
const { shareCover } = require("../../utils/media");
Page({
  data: { s: null, id: "", showDissolve: false, reason: "", seatRows: [], weather: null, reviews: { list: [], count: 0, avg: 0 } },
  onLoad(q) {
    this.setData({ id: q.id });
    wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
  },
  onShow() { this.load(); },
  load() {
    request("/schedules/" + this.data.id).then((r) => {
      const s = r.data;
      if (s && s.chain) {
        s.chain = s.chain.map((c) => Object.assign({}, c, { payText: payStatusText(c.payStatus) }));
      }
      this.setData({ s });
      const region = s && s.route && s.route.region;
      const date = s && s.startDate;
      if (region) {
        request("/weather?region=" + encodeURIComponent(region) + "&date=" + (date || "")).then((w) => {
          this.setData({ weather: w.data });
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
  },
  enroll() { wx.navigateTo({ url: "/pages/enroll/enroll?id=" + this.data.id }); },
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
