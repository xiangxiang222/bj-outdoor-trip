const { request, showError } = require("../../utils/request");

const FALLBACK_BUSES = [
  { id: "coaster10", name: "10 人考斯特" },
  { id: "van15", name: "15 人商务车" },
  { id: "bus30", name: "30 人中巴" },
  { id: "bus38", name: "38 人旅游大巴" },
  { id: "bus50", name: "50 人大型大巴" },
];
const FALLBACK_MEETUPS = [
  "东直门东方银座C口",
  "西直门凯德mall北门外",
  "国贸桥下大巴停靠点",
  "丽泽桥西南角",
];
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
  start.setDate(start.getDate() + 1);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({
      value: formatDate(d),
      label: formatDate(d) + " 周" + WEEKDAY[d.getDay()],
    });
  }
  return out;
}

function applyList(list, firstIdKey) {
  const rows = list.length ? list : [];
  return {
    rows,
    names: rows.map((row) => (typeof row === "string" ? row : row.name)),
    firstId: rows[0] ? (typeof rows[0] === "string" ? rows[0] : rows[0][firstIdKey]) : "",
  };
}

Page({
  data: {
    id: "",
    title: "",
    types: ["个人开团（先报名，出行前付款）", "公司开团（统一支付）"],
    typeIndex: 0,
    dates: [],
    dateLabels: [],
    dateIndex: 0,
    buses: [],
    busNames: [],
    busIndex: 0,
    meetupNames: [],
    meetupIndex: 0,
    times: ["06:30", "07:00", "07:30", "08:00", "08:30"],
    timeIndex: 2,
    form: {
      startDate: "",
      organizerType: "individual",
      companyName: "",
      busTypeId: "",
      minGroupSize: "10",
      meetupPoint: "",
      meetupTime: "07:30",
    },
  },
  onLoad(q) {
    const app = getApp();
    if (!app.globalData.token) {
      wx.redirectTo({
        url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/open/open?id=" + (q.id || "")),
      });
      return;
    }
    const dates = buildDates(60);
    this.setData({
      id: q.id,
      dates,
      dateLabels: dates.map((item) => item.label),
      "form.startDate": dates[0].value,
      buses: FALLBACK_BUSES,
      busNames: FALLBACK_BUSES.map((b) => b.name),
      "form.busTypeId": FALLBACK_BUSES[0].id,
      meetupNames: FALLBACK_MEETUPS,
      "form.meetupPoint": FALLBACK_MEETUPS[0],
    });
    this.loadRoute(q.id);
  },
  loadRoute(id) {
    request("/routes/" + id)
      .then((r) => {
        const route = r.data || {};
        const busList = applyList(route.buses && route.buses.length ? route.buses : FALLBACK_BUSES, "id");
        const meetups = (route.meetupPoints || []).map((m) => m.name).filter(Boolean);
        const meetupNames = meetups.length ? meetups : FALLBACK_MEETUPS;
        this.setData({
          title: route.title || "",
          buses: busList.rows,
          busNames: busList.names,
          busIndex: 0,
          "form.busTypeId": busList.firstId,
          "form.minGroupSize": String(route.minGroupSize || 10),
          meetupNames,
          meetupIndex: 0,
          "form.meetupPoint": meetupNames[0],
        });
      })
      .catch(() => {
        wx.showToast({ title: "线路信息未拉到，已用默认车型和集合点", icon: "none" });
      });
  },
  setDate(e) {
    const i = Number(e.detail.value);
    this.setData({ dateIndex: i, "form.startDate": this.data.dates[i].value });
  },
  setType(e) {
    const i = Number(e.detail.value);
    this.setData({ typeIndex: i, "form.organizerType": i === 1 ? "company" : "individual" });
  },
  setCo(e) {
    this.setData({ "form.companyName": e.detail.value });
  },
  setBus(e) {
    const i = Number(e.detail.value);
    const bus = this.data.buses[i];
    this.setData({ busIndex: i, "form.busTypeId": bus && bus.id });
  },
  setMin(e) {
    this.setData({ "form.minGroupSize": e.detail.value });
  },
  setMeetup(e) {
    const i = Number(e.detail.value);
    this.setData({ meetupIndex: i, "form.meetupPoint": this.data.meetupNames[i] });
  },
  setTime(e) {
    const i = Number(e.detail.value);
    this.setData({ timeIndex: i, "form.meetupTime": this.data.times[i] });
  },
  async submit() {
    const form = this.data.form;
    if (!form.startDate) {
      wx.showToast({ title: "请选择出发日期", icon: "none" });
      return;
    }
    if (!form.busTypeId) {
      wx.showToast({ title: "请选择车型", icon: "none" });
      return;
    }
    if (form.organizerType === "company" && !form.companyName) {
      wx.showToast({ title: "公司开团请填写公司名称", icon: "none" });
      return;
    }
    const minGroupSize = parseInt(String(form.minGroupSize), 10);
    if (!minGroupSize || minGroupSize < 1) {
      wx.showToast({ title: "请填写最低成团人数", icon: "none" });
      return;
    }
    try {
      wx.showLoading({ title: "发布中", mask: true });
      const res = await request("/schedules", "POST", {
        routeId: Number(this.data.id),
        ...form,
        minGroupSize,
      });
      wx.hideLoading();
      wx.redirectTo({ url: "/pages/schedule/schedule?id=" + res.data.id });
    } catch (e) {
      wx.hideLoading();
      showError("发布失败", e);
    }
  },
});
