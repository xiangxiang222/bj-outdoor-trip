const { request } = require("../../utils/request");
const app = getApp();

function sectorDeg(index, n) {
  const count = Math.max(Number(n) || 1, 1);
  const slice = 360 / count;
  return 360 - (Number(index) + 0.5) * slice;
}

function conicOf(prizes) {
  const list = prizes || [];
  if (!list.length) return "#eee";
  const slice = 360 / list.length;
  const fallback = ["#e1251b", "#f5a623", "#7cb342", "#42a5f5", "#26a69a", "#c8ccc4"];
  const stops = list.map((p, i) => {
    const color = p.color || fallback[i % fallback.length];
    return color + " " + i * slice + "deg " + (i + 1) * slice + "deg";
  });
  return "conic-gradient(from 0deg, " + stops.join(",") + ")";
}

function labelsOf(prizes) {
  const list = prizes || [];
  const slice = 360 / Math.max(list.length, 1);
  return list.map((p, i) => ({
    key: p.key || String(i),
    text: String(p.label || "").slice(0, 6),
    angle: (i + 0.5) * slice,
    back: -((i + 0.5) * slice),
  }));
}

function fxTitleOf(level) {
  const lv = Number(level || 9);
  if (lv <= 1) return "恭喜一等奖";
  if (lv === 2) return "恭喜二等奖";
  if (lv === 3) return "恭喜三等奖";
  if (lv >= 9) return "谢谢参与";
  return "中奖啦";
}

Page({
  data: {
    state: { pre: null, post: null, canPre: false, prizes: [], title: "活动抽奖", spinSeconds: 5 },
    msg: "",
    scheduleId: 0,
    phase: "pre",
    deg: 0,
    spinning: false,
    conic: "#eee",
    labels: [],
    spinSec: 5,
    fx: null,
    fxTitle: "",
    canLogin: false,
  },
  onLoad(q) {
    this.setData({
      scheduleId: Number(q.scheduleId || 0),
      phase: q.phase === "post" ? "post" : "pre",
    });
  },
  onShow() {
    this.load();
  },
  applyWheel(state) {
    const prizes = (state && state.prizes) || [];
    const park = this.data.phase === "post" ? state.post : state.pre;
    const deg = park ? sectorDeg(park.sectorIndex, prizes.length) : 0;
    this.setData({
      state,
      conic: conicOf(prizes),
      labels: labelsOf(prizes),
      spinSec: Number(state.spinSeconds || 5),
      deg,
      canLogin: !!app.globalData.token,
    });
  },
  async load() {
    try {
      const res = await request("/lottery?scheduleId=" + this.data.scheduleId);
      this.applyWheel(res.data || {});
    } catch (e) {
      this.setData({ msg: (e && e.message) || "加载失败", canLogin: !!app.globalData.token });
    }
  },
  async draw() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/lottery/lottery") });
      return;
    }
    if (this.data.spinning) return;
    if (this.data.phase === "pre" && !this.data.state.canPre) return;
    if (this.data.phase === "post" && !this.data.state.canPost) return;
    this.setData({ spinning: true, msg: "" });
    try {
      const res = await request("/lottery/draw", "POST", {
        phase: this.data.phase,
        scheduleId: this.data.scheduleId,
      });
      const result = res.data || {};
      const n = (this.data.state.prizes || []).length;
      const wait = (result.already ? 0.35 : this.data.spinSec) * 1000;
      this.setData({
        deg: (result.already ? 1 : 6) * 360 + sectorDeg(result.sectorIndex, n),
        spinning: true,
      });
      await new Promise((resolve) => setTimeout(resolve, wait + 80));
      this.setData({
        spinning: false,
        fx: result.already ? null : result,
        fxTitle: fxTitleOf(result.level),
        msg: result.already ? "已经抽过了" : "",
      });
      this.load();
    } catch (e) {
      this.setData({ spinning: false, msg: (e && e.message) || "抽奖失败" });
    }
  },
  closeFx() {
    this.setData({ fx: null });
  },
  noop() {},
});
