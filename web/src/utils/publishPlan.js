import { emptyCampusTarget, formatCampusTarget, normalizeCampusTargets } from "./campusTargets";
import { splitCampusNames } from "./campusNames";
import { applyCampusPublish } from "./genderRatio";
import { todayYmd } from "./trips";

export const CAMPUS_SCOPES = [
  { key: "school", label: "本校同行", hint: "本校所有学院" },
  { key: "college", label: "本院同行", hint: "指定一个学院" },
  { key: "colleges", label: "跨院同行", hint: "本校多个学院" },
  { key: "schools", label: "跨校同行", hint: "多校、学院自由组合" },
  { key: "certified", label: "高校联谊", hint: "所有已认证师生" },
  { key: "open", label: "开放报名", hint: "不限校园身份" },
];

export function campusTargetsForPlan(form = {}) {
  const school = String(form.campusSchool || form.companyName || "").trim();
  const scope = form.campusScope || "open";
  if (scope === "open" && form.organizerType === "campus" && form.offerType === "free") {
    return school ? [emptyCampusTarget(school)] : [];
  }
  if (scope === "school") return school ? [emptyCampusTarget(school)] : [];
  if (scope === "college") return school ? [emptyCampusTarget(school, form.campusCollege)] : [];
  if (scope === "colleges") {
    return splitCampusNames(form.colleges).map((college) => emptyCampusTarget(school, college));
  }
  if (scope === "schools") return normalizeCampusTargets(form.campusTargets);
  return [];
}

export function campusAudienceSummary(form = {}) {
  const targets = campusTargetsForPlan(form);
  const who = form.alumniOk ? "已认证师生及校友" : "已认证师生";
  if (targets.length) return `${targets.map(formatCampusTarget).join("；")} · ${who}`;
  if (form.campusScope === "certified" || (!form.campusScope && form.studentOnly) || form.alumniOk) return `${who}，不限学校和学院`;
  return "所有人均可报名";
}

export function prepareSchedulePayload(form = {}) {
  const payload = { ...form, playTagIds: [...(form.playTagIds || [])] };
  if (payload.organizerType === "campus") {
    payload.campusTargets = campusTargetsForPlan(form);
    const freeOpenCampus = form.offerType === "free" && form.campusScope === "open";
    payload.campusScope = freeOpenCampus ? "school" : form.campusScope;
    payload.studentOnly = payload.campusScope !== "open" || !!form.alumniOk;
  }
  applyCampusPublish(payload);
  // An explicit verified-campus scope overrides the free-trip host default.
  if (form.organizerType === "campus" && form.campusScope === "certified") {
    payload.campusScope = form.campusScope;
  }
  if (form.organizerType === "campus" && form.campusScope === "open" && form.offerType !== "free") {
    payload.campusScope = "open";
    payload.studentOnly = false;
    payload.alumniOk = false;
  }
  payload.routeId = Number(payload.routeId);
  payload.minGroupSize = Number(payload.minGroupSize);
  payload.companyName = payload.organizerType === "individual" ? "" : String(payload.companyName || "").trim();
  payload.joinCode = payload.privateJoin ? String(payload.joinCode || "").trim().replace(/\s+/g, "") : "";
  if (payload.offerType !== "combo") delete payload.comboRule;
  return payload;
}

export function prepareActivityPayload(form = {}) {
  return {
    ...prepareSchedulePayload({ ...form, organizerType: "individual" }),
    channel: "activity",
    title: String(form.title || "").trim(),
    meetupPoint: String(form.meetupPoint || "").trim(),
    days: 1,
    originPrice: Number(form.originPrice),
    minGroupSize: Number(form.minGroupSize),
    maxSeats: Number(form.maxSeats),
    offerType: Number(form.originPrice) > 0 ? "full" : "free",
  };
}

function validDate(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T12:00:00`);
  return Number.isFinite(date.getTime()) && todayYmd(date) === text;
}

export function validatePublishPlan(form = {}, { step, today = todayYmd(), buses = [], profile = {} } = {}) {
  const at = (index) => step == null || step === index;
  const activity = form.channel === "activity";
  if (at(0)) {
    if (!activity && !Number(form.routeId)) return "请先选择一条出行线路";
    if (!activity && form.offerType === "combo" && !profile.isStudent && profile.groupStatus !== "approved") {
      return "组合团目前只对已认证学生或学生组织开放";
    }
    if (activity && !String(form.title || "").trim()) return "给这次活动起一个名字吧";
    if (!validDate(form.startDate)) return "请选择有效的出发日期";
    if (form.startDate < today) return "出发日期不能早于今天";
    if (activity && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.meetupTime || "")) return "请选择活动开始时间";
  }
  if (at(1)) {
    if (activity) {
      if (!String(form.meetupPoint || "").trim()) return "请填写具体集合地点";
      if (!String(form.city || "").trim()) return "请选择活动所在城区";
      if (!Number.isInteger(Number(form.maxSeats)) || Number(form.maxSeats) < 1) return "人数上限应为大于 0 的整数";
      if (!Number.isInteger(Number(form.minGroupSize)) || Number(form.minGroupSize) < 1) return "成局人数应为大于 0 的整数";
      if (Number(form.minGroupSize) > Number(form.maxSeats)) return "成局人数不能超过人数上限";
      if (form.originPrice === "" || form.originPrice == null || !Number.isFinite(Number(form.originPrice)) || Number(form.originPrice) < 0) return "请填写有效费用，免费活动填 0";
    } else if (form.organizerType === "company") {
      if (!String(form.companyName || "").trim()) return "请填写发起公司的全称";
    } else if (form.organizerType === "campus") {
      if (!String(form.companyName || "").trim()) return "请选择发起学校";
      const scope = form.campusScope || "open";
      if (["school", "college", "colleges"].includes(scope) && !String(form.campusSchool || "").trim()) return "请选择报名范围对应的学校";
      if (scope === "college" && !String(form.campusCollege || "").trim()) return "请选择开放报名的学院";
      if (scope === "colleges" && !splitCampusNames(form.colleges).length) return "请至少选择一个开放报名的学院";
      if (scope === "schools") {
        if (!form.campusTargets?.length) return "请添加至少一组学校、学院或专业";
        if (form.campusTargets.some((row) => !String(row.school || "").trim())) return "请补全每组报名范围的学校，或删除空白组";
        if (form.campusTargets.some((row) => row.major && !row.college)) return "限定专业时，请先选择该专业所属的学院";
      }
    }
  }
  if (at(2)) {
    if (!activity) {
      const bus = buses.find((row) => String(row.id) === String(form.busTypeId));
      if (!bus) return "请选择本线路可用的车型";
      if (!Number.isInteger(Number(form.minGroupSize)) || Number(form.minGroupSize) < 1) return "成团人数应为大于 0 的整数";
      if (Number(form.minGroupSize) > Number(bus.seats)) return `成团人数不能超过车型的 ${bus.seats} 个座位`;
      if (!String(form.meetupPoint || "").trim()) return "请选择集合地点";
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.meetupTime || "")) return "请选择有效的集合时间";
    }
    const code = String(form.joinCode || "").trim().replace(/\s+/g, "");
    if (form.privateJoin && code && (code.length < 4 || code.length > 16)) return "入团口令需要 4～16 个字，也可以留空自动生成";
  }
  return "";
}
