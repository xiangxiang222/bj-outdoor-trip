const { request, showError } = require("../../utils/request");
const { isDark } = require("../../utils/appearance");
const { OFFER_TYPES } = require("../../utils/offer");
const { KINDS, kindByKey, composeActivityDescription, validateActivityDetails } = require("../../utils/activity-kind");
const { openCampusPick, emptyTarget, patchTarget } = require("../../utils/campus");
const { syncGenderRatio, genderRowsFor, payload: genderPayload } = require("../../utils/gender-ratio");

const MEETUPS = ["东直门东方银座C口", "西直门凯德mall北门外", "国贸桥下大巴停靠点", "丽泽桥西南角"];
const DAYS = [1, 2, 3, "multi"];
const DAY_LABELS = ["1 日", "2 日", "3 日", "多日"];
const WEEKDAY = "日一二三四五六";
const DISTRICTS = ["东城", "西城", "朝阳", "海淀", "丰台", "石景山", "通州", "顺义", "昌平", "大兴", "房山", "门头沟", "怀柔", "平谷", "密云", "延庆"];
const CHANNELS = ["trip", "activity"];
const CHANNEL_LABELS = ["户外线路（上首页）", "同城局（上活动 Tab）"];

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}
function decodeQuery(value) {
  try { return decodeURIComponent(value || ""); }
  catch { return String(value || ""); }
}
function formatDate(d) {
  const shanghai = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return shanghai.getUTCFullYear() + "-" + pad(shanghai.getUTCMonth() + 1) + "-" + pad(shanghai.getUTCDate());
}
function buildDates(count) {
  const start = new Date();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const weekday = new Date(d.getTime() + 8 * 60 * 60 * 1000).getUTCDay();
    out.push({ value: formatDate(d), label: formatDate(d) + " 周" + WEEKDAY[weekday] });
  }
  return out;
}

Page({
  data: {
    tags: [],
    kinds: KINDS,
    selectedActivityKind: KINDS[0],
    activityFields: KINDS[0].fields,
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
    routes: [],
    routeTitles: [],
    routeIndex: 0,
    routeLabel: "正在加载",
    meetupNames: MEETUPS,
    meetupIndex: 0,
    organizerLabels: ["个人开团", "公司开团", "高校开团"],
    organizerKeys: ["individual", "company", "campus"],
    organizerIndex: 0,
    cityNames: DISTRICTS,
    cityIndex: 2,
    errors: {},
    submitting: false,
    dark: false,
    form: {
      title: "",
      city: "",
      days: 1,
      channel: "trip",
      activityKind: "掼蛋",
      activityDetails: {},
      playTagIds: [],
      offerType: "full",
      originPrice: 199,
      routeId: "",
      startDate: "",
      organizerType: "individual",
      companyName: "",
      busTypeId: "",
      minGroupSize: 10,
      maxSeats: 12,
      meetupPoint: MEETUPS[0],
      meetupTime: "07:30",
      description: "",
      videoUrls: "",
      comboRule: { require: "student_or_group", school: "" },
      studentOnly: false,
      alumniOk: false,
      oversub: false,
      campusTargets: [],
      genderRatioOn: false,
      schoolRatioOn: false,
      overallMale: 50,
      overallFemale: 50,
      genderSchools: [],
      genderRows: [],
      genderColleges: [],
      privateJoin: false,
      joinCode: "",
      notes: "",
    },
  },
  onShow() { this.setData({ dark: isDark() }); },
  onLoad(q) {
    const app = getApp();
    const organizer = ["individual", "company", "campus"].includes(q.organizer) ? q.organizer : "";
    const publishQuery = ["organizer", "routeId", "id", "date", "channel", "kind", "title"]
      .filter((key) => q[key]).map((key) => key + "=" + encodeURIComponent(q[key])).join("&");
    const publishUrl = "/pages/publish/publish" + (publishQuery ? "?" + publishQuery : "");
    if (!app.globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent(publishUrl) });
      return;
    }
    const dates = buildDates(60);
    let dateIndex = 1;
    if (q.date) {
      const i = dates.findIndex((d) => d.value === q.date);
      if (i >= 0) dateIndex = i;
    }
    const kind = decodeQuery(q.kind);
    const organizerIndex = organizer ? ["individual", "company", "campus"].indexOf(organizer) : 0;
    const title = decodeQuery(q.title);
    const asActivity = q.channel === "activity" || KINDS.some((k) => k.key === kind || k.key === title);
    const activityKind = KINDS.some((k) => k.key === kind) ? kind : KINDS.some((k) => k.key === title) ? title : "掼蛋";
    const user = app.globalData.user || {};
    this._organizerNames = { individual: "", company: user.companyName || "", campus: user.school || "" };
    this._initialRouteId = Number(q.routeId || q.id) || 0;
    this.setData({
      dates,
      dateLabels: dates.map((d) => d.label),
      dateIndex,
      organizerIndex,
      channelIndex: asActivity ? 1 : 0,
      "form.startDate": dates[dateIndex].value,
      "form.channel": asActivity ? "activity" : "trip",
      "form.activityKind": activityKind,
      selectedActivityKind: kindByKey(activityKind),
      activityFields: kindByKey(activityKind).fields,
      "form.title": title && !KINDS.some((k) => k.key === title) ? title : "",
      "form.organizerType": organizer || this.data.form.organizerType,
      "form.offerType": asActivity ? "free" : this.data.form.offerType,
      "form.originPrice": asActivity ? 0 : this.data.form.originPrice,
      "form.minGroupSize": asActivity ? 4 : this.data.form.minGroupSize,
      "form.maxSeats": 12,
      "form.meetupTime": asActivity ? "19:30" : this.data.form.meetupTime,
      "form.meetupPoint": asActivity ? "" : MEETUPS[0],
      "form.city": asActivity ? "朝阳" : "",
      "form.companyName": this._organizerNames[organizer || "individual"],
    });
    this.boot();
  },
  async boot() {
    try {
      const jobs = [request("/play-tags"), request("/buses")];
      if (this.data.form.channel !== "activity") jobs.push(request("/routes"));
      const [tagRes, busRes, routeRes] = await Promise.all(jobs);
      const tags = (tagRes.data || []).map((t) => Object.assign({}, t, { on: false }));
      const buses = busRes.data || [];
      const routes = (routeRes && routeRes.data) || [];
      this.setData({
        tags,
        buses,
        busNames: buses.map((b) => b.name),
        "form.busTypeId": buses[0] ? buses[0].id : "",
        routes,
        routeTitles: routes.map((r) => r.title),
        routeLabel: routes.length ? "选择已有线路" : "暂无可选线路",
      });
      if (this._initialRouteId) {
        const routeIndex = routes.findIndex((route) => Number(route.id) === this._initialRouteId);
        if (routeIndex >= 0) await this.setRoute({ detail: { value: routeIndex } });
        this._initialRouteId = 0;
      }
    } catch (e) {
      if (this.data.routeLabel === "正在加载") this.setData({ routeLabel: "暂无可选线路" });
      showError("加载失败", e);
    }
  },
  setField(e) {
    const key = e.currentTarget.dataset.k;
    const patch = { ["form." + key]: e.detail.value };
    if (this.data.errors && this.data.errors[key]) patch["errors." + key] = "";
    this.setData(patch);
  },
  setCityPick(e) {
    const i = Number(e.detail.value);
    this.setData({ cityIndex: i, "form.city": this.data.cityNames[i] || "", "errors.city": "" });
  },
  setMeetupTime(e) {
    this.setData({ "form.meetupTime": e.detail.value, "errors.meetupTime": "" });
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
    if (!kindByKey(key)) return;
    const prev = this.data.form.activityKind;
    this._activityDrafts = this._activityDrafts || {};
    this._activityDrafts[prev] = this.data.form.activityDetails || {};
    const title = !this.data.form.title || this.data.form.title === prev ? key : this.data.form.title;
    this.setData({ "form.activityKind": key, "form.title": title === key ? "" : title, "form.activityDetails": this._activityDrafts[key] || {}, selectedActivityKind: kindByKey(key), activityFields: kindByKey(key).fields, "errors.activityDetails": "" });
  },
  setActivityField(e) {
    const key = e.currentTarget.dataset.key;
    if (!this.data.activityFields.some((field) => field.key === key)) return;
    this.setData({ ["form.activityDetails." + key]: e.detail.value, "errors.activityDetails": "" });
  },
  setDay(e) {
    const i = Number(e.detail.value);
    this.setData({ dayIndex: i, "form.days": DAYS[i] });
  },
  setOffer(e) {
    const i = Number(e.detail.value);
    this.setData({ offerIndex: i, "form.offerType": OFFER_TYPES[i].key });
    this.applyCampusFree();
  },
  setComboRequire(e) {
    const i = Number(e.detail.value);
    this.setData({ comboRequireIndex: i, "form.comboRule.require": this.data.comboRequireKeys[i] });
  },
  setComboSchool(e) {
    this.setData({ "form.comboRule.school": e.detail.value });
  },
  pickComboSchool() {
    openCampusPick({
      kind: "school",
      title: "另一半学校",
      selected: this.data.form.comboRule.school,
      onPick: (names) => this.setData({ "form.comboRule.school": names[0] || "" }),
    });
  },
  writeGender(targets, schools) {
    const schoolRatioOn = (schools || []).some((row) => row && row.on);
    const patch = {
      "form.campusTargets": targets,
      "form.genderSchools": schools,
      "form.genderRows": genderRowsFor(targets, schools),
      "form.genderColleges": [],
      "form.schoolRatioOn": schoolRatioOn,
    };
    if (schoolRatioOn) patch["form.genderRatioOn"] = false;
    this.setData(patch);
  },
  refreshGender(targets) {
    const next = syncGenderRatio(this.data.form, targets);
    this.writeGender(targets, next.genderSchools);
  },
  addCampusTarget() {
    const campusTargets = (this.data.form.campusTargets || []).concat([emptyTarget()]);
    this.refreshGender(campusTargets);
  },
  removeCampusTarget(e) {
    const i = Number(e.currentTarget.dataset.i);
    const campusTargets = (this.data.form.campusTargets || []).filter((_, idx) => idx !== i);
    this.refreshGender(campusTargets);
  },
  pickTargetSchool(e) {
    const i = Number(e.currentTarget.dataset.i);
    const row = (this.data.form.campusTargets || [])[i] || {};
    openCampusPick({
      kind: "school",
      title: "选择学校",
      selected: row.school,
      onPick: (names) => {
        const campusTargets = patchTarget(this.data.form.campusTargets, i, "school", names[0] || "");
        this.refreshGender(campusTargets);
      },
    });
  },
  pickTargetCollege(e) {
    const i = Number(e.currentTarget.dataset.i);
    const row = (this.data.form.campusTargets || [])[i] || {};
    if (!row.school) {
      this.setData({ "errors.campus": "请先选择学校" });
      return;
    }
    this.setData({ "errors.campus": "" });
    openCampusPick({
      kind: "college",
      school: row.school,
      title: "选择学院",
      selected: row.college,
      onPick: (names) => {
        const campusTargets = patchTarget(this.data.form.campusTargets, i, "college", names[0] || "");
        this.refreshGender(campusTargets);
      },
    });
  },
  pickTargetMajor(e) {
    const i = Number(e.currentTarget.dataset.i);
    const row = (this.data.form.campusTargets || [])[i] || {};
    if (!row.college) {
      this.setData({ "errors.campus": "请先选择学院" });
      return;
    }
    this.setData({ "errors.campus": "" });
    openCampusPick({
      kind: "major",
      school: row.school,
      college: row.college,
      title: "选择专业",
      selected: row.major,
      onPick: (names) => this.setData({ "form.campusTargets": patchTarget(this.data.form.campusTargets, i, "major", names[0] || "") }),
    });
  },
  pickCompanySchool() {
    openCampusPick({
      kind: "school",
      title: "学校名称",
      selected: this.data.form.companyName,
      onPick: (names) => this.setData({ "form.companyName": names[0] || "" }),
    });
  },
  toggleStudentOnly() {
    this.setData({ "form.studentOnly": !this.data.form.studentOnly });
  },
  toggleAlumniOk() {
    this.setData({ "form.alumniOk": !this.data.form.alumniOk });
  },
  toggleGender() {
    if (this.data.form.schoolRatioOn) return;
    this.setData({ "form.genderRatioOn": !this.data.form.genderRatioOn });
  },
  toggleSchoolRatio(e) {
    if (this.data.form.genderRatioOn) return;
    const school = e.currentTarget.dataset.school;
    const rows = (this.data.form.genderSchools || []).map((row) => (
      row.school === school ? Object.assign({}, row, { on: !row.on }) : row
    ));
    this.writeGender(this.data.form.campusTargets, rows);
  },
  setRatio(e) {
    const value = Math.min(100, Math.max(0, Math.round(Number(e.detail.value) || 0)));
    const bucket = e.currentTarget.dataset.bucket;
    if (bucket === "overall") {
      if (this.data.form.schoolRatioOn) return;
      this.setData({
        "form.genderRatioOn": true,
        "form.overallMale": value,
        "form.overallFemale": 100 - value,
      });
      return;
    }
    if (this.data.form.genderRatioOn) return;
    const school = e.currentTarget.dataset.school;
    const rows = (this.data.form.genderSchools || []).map((row) => (
      row.school === school ? Object.assign({}, row, { on: true, share: value, male: value, female: 100 - value }) : row
    ));
    this.writeGender(this.data.form.campusTargets, rows);
  },
  toggleOversub() {
    this.setData({ "form.oversub": !this.data.form.oversub });
  },
  togglePrivateJoin() {
    this.setData({ "form.privateJoin": !this.data.form.privateJoin });
  },
  setDate(e) {
    const i = Number(e.detail.value);
    this.setData({ dateIndex: i, "form.startDate": this.data.dates[i].value });
  },
  setOrganizer(e) {
    const i = Number(e.detail.value);
    const next = this.data.organizerKeys[i] || "individual";
    this._organizerNames = this._organizerNames || {};
    this._organizerNames[this.data.form.organizerType] = this.data.form.companyName || "";
    this.setData({ organizerIndex: i, "form.organizerType": next, "form.companyName": this._organizerNames[next] || "", "errors.companyName": "" });
    this.applyCampusFree();
  },
  applyCampusFree() {
    const form = this.data.form || {};
    if (form.organizerType !== "campus" || form.offerType !== "free") return;
    this.setData({ "form.oversub": true, "form.studentOnly": true });
  },
  setCompanyName(e) {
    this.setData({ "form.companyName": e.detail.value, "errors.companyName": "" });
  },
  setBus(e) {
    const i = Number(e.detail.value);
    this.setData({ busIndex: i, "form.busTypeId": this.data.buses[i].id });
  },
  setMeetup(e) {
    const i = Number(e.detail.value);
    this.setData({ meetupIndex: i, "form.meetupPoint": this.data.meetupNames[i] });
  },
  async setRoute(e) {
    const i = Number(e.detail.value);
    const route = (this.data.routes || [])[i];
    if (!route) return;
    let meetupNames = MEETUPS.slice();
    let minGroup = this.data.form.minGroupSize;
    try {
      const detail = await request("/routes/" + route.id);
      const points = ((detail.data && detail.data.meetupPoints) || []).map((p) => p.name).filter(Boolean);
      if (points.length) meetupNames = points;
      if (detail.data && detail.data.minGroupSize) minGroup = detail.data.minGroupSize;
    } catch (err) {
      showError("加载线路失败", err);
    }
    this.setData({
      routeIndex: i,
      routeLabel: route.title,
      meetupNames,
      meetupIndex: 0,
      "form.routeId": route.id,
      "form.meetupPoint": meetupNames[0],
      "form.minGroupSize": minGroup,
      "errors.routeId": "",
    });
  },
  toggleTag(e) {
    const id = Number(e.currentTarget.dataset.id);
    const tags = this.data.tags.map((t) => (t.id === id ? Object.assign({}, t, { on: !t.on }) : t));
    this.setData({ tags, "form.playTagIds": tags.filter((t) => t.on).map((t) => t.id) });
  },
  blockSubmit(key, message) {
    const patch = { "errors.form": message };
    if (key) patch["errors." + key] = message;
    this.setData(patch, () => wx.pageScrollTo({ selector: "#submit-error", duration: 200 }));
  },
  async submit() {
    if (this.data.submitting) return;
    const form = Object.assign({}, this.data.form);
    const minimum = Number(form.minGroupSize);
    if (!Number.isInteger(minimum) || minimum < 1) {
      this.blockSubmit("minGroupSize", "成团人数请填写大于 0 的整数");
      return;
    }
    if (!form.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(form.startDate) || form.startDate < formatDate(new Date())) {
      this.blockSubmit("startDate", "请选择今天或以后的出发日期");
      return;
    }
    if (form.privateJoin && form.joinCode && (form.joinCode.trim().length < 4 || form.joinCode.trim().length > 16)) {
      this.blockSubmit("joinCode", "入团口令需要 4～16 个字");
      return;
    }
    if (form.channel === "activity") {
      const maxSeats = Number(form.maxSeats);
      const price = Number(form.originPrice);
      if (!Number.isInteger(maxSeats) || maxSeats < minimum) {
        this.blockSubmit("maxSeats", "人数上限不能低于成团人数");
        return;
      }
      if (form.originPrice == null || String(form.originPrice).trim() === "" || !Number.isFinite(price) || price < 0) {
        this.blockSubmit("originPrice", "请填写有效费用，免费活动填 0");
        return;
      }
    } else {
      const bus = this.data.buses.find((item) => String(item.id) === String(form.busTypeId));
      if (!bus) {
        this.blockSubmit("busTypeId", "请选择出行车型");
        return;
      }
      if (minimum > Number(bus.seats)) {
        this.blockSubmit("minGroupSize", "成团人数不能超过所选车型的座位数");
        return;
      }
      if (form.organizerType === "campus" && (form.campusTargets || []).some((target) => !String(target.school || "").trim())) {
        this.blockSubmit("campus", "请为每个招募范围选择学校，或删除空白范围");
        return;
      }
      if (form.organizerType === "campus" && (form.campusTargets || []).some((target) => String(target.major || "").trim() && !String(target.college || "").trim())) {
        this.blockSubmit("campus", "限定专业时，请先选择该专业所属的学院");
        return;
      }
    }
    if (form.channel === "activity") {
      if (!String(form.title || "").trim()) {
        this.blockSubmit("title", "请填写标题");
        return;
      }
      form.days = 1;
      form.organizerType = "individual";
      form.offerType = Number(form.originPrice) > 0 ? "full" : "free";
      if (!String(form.meetupPoint || "").trim()) {
        this.blockSubmit("meetupPoint", "请填写地点");
        return;
      }
      if (!String(form.city || "").trim()) { this.blockSubmit("city", "请选择活动所在城区"); return; }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.meetupTime || "")) { this.blockSubmit("meetupTime", "请选择活动开始时间"); return; }
      const detailError = validateActivityDetails(form.activityKind, form.activityDetails);
      if (detailError) { this.blockSubmit("activityDetails", detailError); return; }
      this.setData({ errors: {} });
      try {
        this.setData({ submitting: true });
        wx.showLoading({ title: "提交中", mask: true });
        const res = await request("/trips", "POST", {
          ...form,
          description: composeActivityDescription(form.activityKind, form.activityDetails, form.description),
          originPrice: Number(form.originPrice),
          minGroupSize: Number(form.minGroupSize),
          maxSeats: Number(form.maxSeats) || 12,
        });
        wx.hideLoading();
        wx.redirectTo({ url: "/pages/schedule/schedule?id=" + res.data.id + "&posted=1" });
      } catch (e) {
        wx.hideLoading({ complete: () => showError("提交失败", e) });
      } finally {
        this.setData({ submitting: false });
      }
      return;
    }
    if (!form.routeId) {
      this.blockSubmit("routeId", "请选择线路");
      return;
    }
    if (form.organizerType === "company" && !String(form.companyName || "").trim()) {
      this.blockSubmit("companyName", "公司开团请填写公司名称");
      return;
    }
    if (form.organizerType === "campus" && !String(form.companyName || "").trim()) {
      this.blockSubmit("companyName", "高校开团请填写学校");
      return;
    }
    this.setData({ errors: {} });
    const campus = form.organizerType === "campus";
    if (campus && form.offerType === "free") {
      form.oversub = true;
      form.studentOnly = true;
    }
    const body = {
      routeId: form.routeId,
      startDate: form.startDate,
      organizerType: form.organizerType,
      companyName: campus || form.organizerType === "company" ? form.companyName : "",
      busTypeId: form.busTypeId,
      minGroupSize: Number(form.minGroupSize),
      meetupPoint: form.meetupPoint,
      meetupTime: form.meetupTime,
      offerType: form.offerType,
      notes: form.notes || "",
      studentOnly: campus ? !!form.studentOnly : false,
      alumniOk: campus ? !!form.alumniOk : false,
      oversub: campus ? !!form.oversub : false,
      campusTargets: campus ? form.campusTargets : [],
      genderRatio: genderPayload(form),
      privateJoin: !!form.privateJoin,
      joinCode: form.joinCode || "",
    };
    if (form.offerType === "combo") body.comboRule = form.comboRule;
    try {
      this.setData({ submitting: true });
      wx.showLoading({ title: "提交中", mask: true });
      const res = await request("/schedules", "POST", body);
      wx.hideLoading();
      wx.redirectTo({ url: "/pages/schedule/schedule?id=" + res.data.id + "&posted=1" });
    } catch (e) {
      wx.hideLoading({ complete: () => showError("提交失败", e) });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
