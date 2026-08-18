const { request } = require("../../utils/request");
const { payStatusText } = require("../../utils/labels");
const { shareCover } = require("../../utils/media");
Page({
  data: { s: null, id: "", showDissolve: false, reason: "" },
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
    });
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
