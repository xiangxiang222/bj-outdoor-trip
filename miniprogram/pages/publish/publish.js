const { request, showError } = require("../../utils/request");
const { OFFER_TYPES } = require("../../utils/offer");
const { KINDS } = require("../../utils/activity-kind");

const MEETUPS = ["东直门东方银座C口", "西直门凯德mall北门外", "国贸桥下大巴停靠点", "丽泽桥西南角"];
const DAYS = [1, 2, 3, "multi"];
const DAY_LABELS = ["1 日", "2 日", "3 日", "多日"];
const WEEKDAY = "日一二三四五六";
const CHANNELS = ["trip", "activity"];
const CHANNEL_LABELS = ["户外线路（上首页）", "同城局（上活动 Tab）"];

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}
function formatDate(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function buildDates(count) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({ value: formatDate(d), label: formatDate(d) + " 周" + WEEKDAY[d.getDay()] });
  }
  return out;
}

Page({
  data: {
    tags: [],
    kinds: KINDS,
    offers: OFFER_TYPES,
    offerLabels: OFFER_TYPES.map((o) => o.label),
    offerIndex: 5,
    channelLabels: CHANNEL_LABELS,
    channelIndex: 0,
    comboRequireLabels: ["学生或学生组织", "仅已认证学生", "仅已认证学生组织"],
    comboRequireKeys: ["student_or_group", "student", "group"],
    comboRequireIndex: 0,
    dayLabels: DAY_LABELS,
    dayIndex: 0,
    dates: [],
    dateLabels: [],
    dateIndex: 1,
    buses: [],
    busNames: [],
    busIndex: 0,
    meetupNames: MEETUPS,
    meetupIndex: 0,
    form: {
      title: "",
      city: "",
      days: 1,
      channel: "trip",
      activityKind: "掼蛋",
      playTagIds: [],
      offerType: "full",
      originPrice: 199,
      startDate: "",
      organizerType: "individual",
      busTypeId: "",
      minGroupSize: 10,
      maxSeats: 12,
      meetupPoint: MEETUPS[0],
      meetupTime: "07:30",
      description: "",
      comboRule: { require: "student_or_group", school: "" },
      studentOnly: false,
      schools: "",
    },
  },
  onLoad(q) {
    const app = getApp();
    if (!app.globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/publish/publish") });
      return;
    }
    const dates = buildDates(60);
    let dateIndex = 1;
    if (q.date) {
      const i = dates.findIndex((d) => d.value === q.date);
      if (i >= 0) dateIndex = i;
    }
    const kind = q.kind ? decodeURIComponent(q.kind) : "";
    const title = q.title ? decodeURIComponent(q.title) : "";
    const asActivity = q.channel === "activity" || KINDS.some((k) => k.key === kind || k.key === title);
    const activityKind = KINDS.some((k) => k.key === kind) ? kind : KINDS.some((k) => k.key === title) ? title : "掼蛋";
    this.setData({
      dates,
      dateLabels: dates.map((d) => d.label),
      dateIndex,
      channelIndex: asActivity ? 1 : 0,
      "form.startDate": dates[dateIndex].value,
      "form.channel": asActivity ? "activity" : "trip",
      "form.activityKind": activityKind,
      "form.title": title && !KINDS.some((k) => k.key === title) ? title : asActivity ? activityKind : title,
      "form.offerType": asActivity ? "free" : this.data.form.offerType,
      "form.originPrice": asActivity ? 0 : this.data.form.originPrice,
      "form.minGroupSize": asActivity ? 4 : this.data.form.minGroupSize,
      "form.maxSeats": 12,
      "form.meetupTime": asActivity ? "19:30" : this.data.form.meetupTime,
      "form.meetupPoint": asActivity ? "" : MEETUPS[0],
      "form.city": asActivity ? "朝阳" : "",
    });
    this.boot();
  },
  async boot() {
    try {
      const [tagRes, busRes] = await Promise.all([request("/play-tags"), request("/buses")]);
      const tags = (tagRes.data || []).map((t) => Object.assign({}, t, { on: false }));
      const buses = busRes.data || [];
      this.setData({
        tags,
        buses,
        busNames: buses.map((b) => b.name),
        "form.busTypeId": buses[0] ? buses[0].id : "",
      });
    } catch (e) {
      showError("加载失败", e);
    }
  },
  setField(e) {
    this.setData({ ["form." + e.currentTarget.dataset.k]: e.detail.value });
  },
  setChannel(e) {
    const i = Number(e.detail.value);
    const channel = CHANNELS[i];
    const patch = { channelIndex: i, "form.channel": channel };
    if (channel === "activity") {
      patch["form.offerType"] = "free";
      patch["form.originPrice"] = 0;
      patch["form.minGroupSize"] = 4;
      patch["form.meetupTime"] = "19:30";
      patch["form.city"] = this.data.form.city || "朝阳";
      patch["form.meetupPoint"] = MEETUPS.includes(this.data.form.meetupPoint) ? "" : this.data.form.meetupPoint;
      patch["form.activityKind"] = this.data.form.activityKind || "掼蛋";
    } else if (!this.data.form.meetupPoint) {
      patch["form.meetupPoint"] = MEETUPS[0];
      patch["form.meetupTime"] = "07:30";
    }
    this.setData(patch);
  },
  pickKind(e) {
    const key = e.currentTarget.dataset.key;
    const prev = this.data.form.activityKind;
    const title = !this.data.form.title || this.data.form.title === prev ? key : this.data.form.title;
    this.setData({ "form.activityKind": key, "form.title": title });
  },
  setDay(e) {
    const i = Number(e.detail.value);
    this.setData({ dayIndex: i, "form.days": DAYS[i] });
  },
  setOffer(e) {
    const i = Number(e.detail.value);
    this.setData({ offerIndex: i, "form.offerType": OFFER_TYPES[i].key });
  },
  setComboRequire(e) {
    const i = Number(e.detail.value);
    this.setData({ comboRequireIndex: i, "form.comboRule.require": this.data.comboRequireKeys[i] });
  },
  setComboSchool(e) {
    this.setData({ "form.comboRule.school": e.detail.value });
  },
  toggleStudentOnly() {
    this.setData({ "form.studentOnly": !this.data.form.studentOnly });
  },
  setDate(e) {
    const i = Number(e.detail.value);
    this.setData({ dateIndex: i, "form.startDate": this.data.dates[i].value });
  },
  setBus(e) {
    const i = Number(e.detail.value);
    this.setData({ busIndex: i, "form.busTypeId": this.data.buses[i].id });
  },
  setMeetup(e) {
    const i = Number(e.detail.value);
    this.setData({ meetupIndex: i, "form.meetupPoint": this.data.meetupNames[i] });
  },
  toggleTag(e) {
    const id = Number(e.currentTarget.dataset.id);
    const tags = this.data.tags.map((t) => (t.id === id ? Object.assign({}, t, { on: !t.on }) : t));
    this.setData({ tags, "form.playTagIds": tags.filter((t) => t.on).map((t) => t.id) });
  },
  async submit() {
    const form = Object.assign({}, this.data.form);
    if (!form.title) {
      wx.showToast({ title: "请填写标题", icon: "none" });
      return;
    }
    if (form.channel === "activity") {
      form.days = 1;
      form.organizerType = "individual";
      form.offerType = Number(form.originPrice) > 0 ? form.offerType || "full" : "free";
      if (!String(form.meetupPoint || "").trim()) {
        wx.showToast({ title: "请填写地点", icon: "none" });
        return;
      }
    }
    try {
      wx.showLoading({ title: "提交中", mask: true });
      const res = await request("/trips", "POST", {
        ...form,
        originPrice: Number(form.originPrice),
        minGroupSize: Number(form.minGroupSize),
        maxSeats: Number(form.maxSeats) || 12,
      });
      wx.hideLoading();
      wx.redirectTo({ url: "/pages/schedule/schedule?id=" + res.data.id });
    } catch (e) {
      wx.hideLoading();
      showError("提交失败", e);
    }
  },
});
