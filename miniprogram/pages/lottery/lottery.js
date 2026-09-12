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

function blurbOf(state) {
  const sec = (state && state.spinSeconds) || 5;
  const mode = (state && state.drawMode) || "off";
  if (mode === "pre") return "本团只在报名前抽一次，转盘约 " + sec + " 秒。中奖先记账，跟团结束后领奖。";
  if (mode === "enroll") return "本团报名后才能抽，转盘约 " + sec + " 秒。中奖先记账，跟团结束后领奖。";
  if (mode === "both") return "报名前、报名后各抽一次，转盘约 " + sec + " 秒。中奖先记账，跟团结束后领奖。两次不是谢谢参与且奖品相同，领取时翻倍。";
  return "转盘约 " + sec + " 秒。报名前可抽一次，交过费且行程结束后再抽第二次，不必签到。";
}

function hintOf(state, canDraw, hasResult) {
  if (!state) return "";
  if (state.canClaim) return "";
  if (state.canPost && !state.canPre) return "已报名，可以抽一次。";
  if (state.pre && state.drawMode === "enroll") return "";
  if (hasResult && !canDraw) return state.claimHint || "已经抽过了。";
  return "";
}

Page({
  data: {
    state: { pre: null, post: null, canPre: false, canPost: false, canClaim: false, prizes: [], title: "活动抽奖", spinSeconds: 5 },
    msg: "",
    scheduleId: 0,
    phase: "pre",
    deg: 0,
    spinning: false,
    claiming: false,
    conic: "#eee",
    labels: [],
    spinSec: 5,
    fx: null,
    fxTitle: "",
    canLogin: false,
    canDraw: false,
    hasResult: false,
    blurb: "",
    hint: "",
    trips: [],
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
    const canDraw = !!(state && (state.canPre || state.canPost));
    const hasResult = !!(state && (state.pre || state.post));
    const park = state && (state.post || state.pre);
    const deg = park ? sectorDeg(park.sectorIndex, prizes.length) : this.data.deg;
    this.setData({
      state,
      trips: (state && state.trips) || [],
      conic: conicOf(prizes),
      labels: labelsOf(prizes),
      spinSec: Number((state && state.spinSeconds) || 5),
      deg,
      canLogin: !!app.globalData.token,
      canDraw,
      hasResult,
      blurb: blurbOf(state),
      hint: hintOf(state, canDraw, hasResult),
    });
  },
  drawPhase(state) {
    if (state && state.canPre) return "pre";
    if (state && state.canPost) return "post";
    return this.data.phase;
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
    if (this.data.spinning || !this.data.canDraw) return;
    this.setData({ spinning: true, msg: "" });
    try {
      const res = await request("/lottery/draw", "POST", {
        phase: this.drawPhase(this.data.state),
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
  async claim() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/lottery/lottery") });
      return;
    }
    if (this.data.claiming) return;
    this.setData({ claiming: true, msg: "" });
    try {
      const res = await request("/lottery/claim", "POST", { scheduleId: this.data.scheduleId });
      this.setData({ claiming: false, msg: (res && res.message) || "奖品已领取" });
      this.load();
    } catch (e) {
      this.setData({ claiming: false, msg: (e && e.message) || "领取失败" });
    }
  },
  goTrip(e) {
    const id = Number(e.currentTarget.dataset.id || 0);
    if (!id) return;
    wx.navigateTo({ url: "/pages/lottery/lottery?scheduleId=" + id });
  },
  closeFx() {
    this.setData({ fx: null });
  },
  noop() {},
});
