const { request, showError } = require("../../utils/request");
const { OFFER_TYPES } = require("../../utils/offer");

const MEETUPS = ["东直门东方银座C口", "西直门凯德mall北门外", "国贸桥下大巴停靠点", "丽泽桥西南角"];
const DAYS = [1, 2, 3, "multi"];
const DAY_LABELS = ["1 日", "2 日", "3 日", "多日"];
const WEEKDAY = "日一二三四五六";

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
    offers: OFFER_TYPES,
    offerLabels: OFFER_TYPES.map((o) => o.label),
    offerIndex: 5,
    comboRequireLabels: ["学生或学生组织", "仅已认证学生", "仅已认证学生组织"],
    comboRequireKeys: ["student_or_group", "student", "group"],
    comboRequireIndex: 0,
    dayLabels: DAY_LABELS,
    dayIndex: 0,
    dates: [],
    dateLabels: [],
    dateIndex: 0,
    buses: [],
    busNames: [],
    busIndex: 0,
    meetupNames: MEETUPS,
    meetupIndex: 0,
    form: {
      title: "",
      city: "",
      days: 1,
      playTagIds: [],
      offerType: "full",
      originPrice: 199,
      startDate: "",
      organizerType: "individual",
      busTypeId: "",
      minGroupSize: 10,
      meetupPoint: MEETUPS[0],
      meetupTime: "07:30",
      description: "",
      comboRule: { require: "student_or_group", school: "" },
    },
  },
  onLoad(q) {
    const app = getApp();
    if (!app.globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/publish/publish") });
      return;
    }
    const dates = buildDates(60);
    let dateIndex = 0;
    if (q.date) {
      const i = dates.findIndex((d) => d.value === q.date);
      if (i >= 0) dateIndex = i;
    }
    this.setData({
      dates,
      dateLabels: dates.map((d) => d.label),
      dateIndex,
      "form.startDate": dates[dateIndex].value,
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
    const form = this.data.form;
    if (!form.title) {
      wx.showToast({ title: "请填写标题", icon: "none" });
      return;
    }
    try {
      wx.showLoading({ title: "提交中", mask: true });
      const res = await request("/trips", "POST", { ...form, originPrice: Number(form.originPrice), minGroupSize: Number(form.minGroupSize) });
      wx.hideLoading();
      wx.redirectTo({ url: "/pages/schedule/schedule?id=" + res.data.id });
    } catch (e) {
      wx.hideLoading();
      showError("提交失败", e);
    }
  },
});
