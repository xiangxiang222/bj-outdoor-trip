"use strict";

const { SCHOOLS, DEFAULT_MAJORS, COLLEGE_SETS } = require("../data/beijingCampuses");

const KINDS = new Set(["school", "college", "major"]);

const MAJOR_GROUPS = [
  { keys: ["计算机", "软件", "信息科学", "网络空间", "人工智能", "数据科学"], majors: ["计算机科学与技术", "软件工程", "网络空间安全", "人工智能", "数据科学与大数据技术", "物联网工程", "信息安全", "智能科学与技术"] },
  { keys: ["电子", "通信", "邮电", "光电", "微电子", "集成电路"], majors: ["电子信息工程", "通信工程", "微电子科学与工程", "光电信息科学与工程", "集成电路设计与集成系统"] },
  { keys: ["机械", "车辆", "汽车", "工业工程"], majors: ["机械设计制造及其自动化", "车辆工程", "工业工程"] },
  { keys: ["土木", "建筑", "城乡", "水利"], majors: ["土木工程", "建筑学", "城乡规划", "水利水电工程", "工程管理"] },
  { keys: ["环境", "化学工程", "化工"], majors: ["环境工程", "化学工程与工艺"] },
  { keys: ["材料"], majors: ["材料科学与工程"] },
  { keys: ["能源", "动力", "电气", "电机"], majors: ["能源与动力工程", "电气工程及其自动化"] },
  { keys: ["航空", "宇航", "航天"], majors: ["航空航天工程"] },
  { keys: ["自动化"], majors: ["自动化"] },
  { keys: ["数学"], majors: ["数学与应用数学", "信息与计算科学", "统计学"] },
  { keys: ["物理"], majors: ["物理学", "应用物理学"] },
  { keys: ["化学"], majors: ["化学", "应用化学"] },
  { keys: ["生命", "生物"], majors: ["生物科学", "生物技术", "生物医学工程"] },
  { keys: ["医学", "临床", "协和"], majors: ["临床医学", "口腔医学", "预防医学", "麻醉学", "医学影像学"] },
  { keys: ["护理"], majors: ["护理学"] },
  { keys: ["药"], majors: ["药学", "中药学"] },
  { keys: ["中医", "针灸"], majors: ["中医学", "针灸推拿学"] },
  { keys: ["口腔"], majors: ["口腔医学"] },
  { keys: ["经济"], majors: ["经济学", "国际经济与贸易", "数字经济"] },
  { keys: ["金融", "财政", "保险", "五道口"], majors: ["金融学", "财政学", "保险学"] },
  { keys: ["管理", "商学院", "工商"], majors: ["工商管理", "会计学", "财务管理", "人力资源管理", "市场营销"] },
  { keys: ["会计"], majors: ["会计学", "财务管理"] },
  { keys: ["旅游"], majors: ["旅游管理"] },
  { keys: ["法"], majors: ["法学", "知识产权"] },
  { keys: ["新闻", "传播", "传媒"], majors: ["新闻学", "广播电视学", "广告学", "网络与新媒体"] },
  { keys: ["外国语", "英语", "日语", "俄语", "法语", "德语", "翻译", "语言"], majors: ["英语", "日语", "俄语", "德语", "法语", "西班牙语", "翻译", "汉语国际教育"] },
  { keys: ["中文", "文学", "汉语"], majors: ["汉语言文学", "汉语国际教育"] },
  { keys: ["历史", "考古"], majors: ["历史学", "考古学", "文物与博物馆学"] },
  { keys: ["哲学"], majors: ["哲学"] },
  { keys: ["教育", "师范"], majors: ["教育学", "学前教育", "小学教育"] },
  { keys: ["心理"], majors: ["心理学"] },
  { keys: ["体育", "运动"], majors: ["体育教育", "运动训练"] },
  { keys: ["音乐"], majors: ["音乐学", "音乐表演"] },
  { keys: ["舞蹈"], majors: ["舞蹈学", "舞蹈表演"] },
  { keys: ["美术", "绘画", "设计"], majors: ["美术学", "绘画", "视觉传达设计", "环境设计", "产品设计", "数字媒体艺术"] },
  { keys: ["戏剧", "表演", "影视", "电影", "导演"], majors: ["表演", "戏剧影视文学", "广播电视编导", "动画"] },
  { keys: ["服装"], majors: ["服装与服饰设计"] },
  { keys: ["农", "园艺", "林", "园林"], majors: ["农学", "园艺", "林学", "园林"] },
  { keys: ["动物"], majors: ["动物科学", "动物医学"] },
  { keys: ["马克思主义"], majors: ["马克思主义理论", "哲学"] },
  { keys: ["公共管理", "政府", "行政"], majors: ["行政管理", "公共事业管理", "政治学与行政学"] },
  { keys: ["社会"], majors: ["社会学", "社会工作"] },
];

function fold(s) {
  return String(s || "").replace(/\s+/g, "").toLowerCase();
}

function matchesQuery(name, aliases, q) {
  const n = fold(q);
  if (!n) return true;
  const hay = [name, ...(aliases || [])].map(fold);
  return hay.some((h) => h.includes(n) || (n.length >= 2 && n.includes(h)));
}

function findSchool(name) {
  const n = fold(name);
  if (!n) return null;
  const exact = SCHOOLS.find((s) => fold(s.name) === n || (s.aliases || []).some((a) => fold(a) === n));
  if (exact) return exact;
  return SCHOOLS.find((s) => matchesQuery(s.name, s.aliases, name)) || null;
}

function uniqueNames(list) {
  const seen = new Set();
  const out = [];
  for (const name of list) {
    const n = String(name || "").trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function guessCollegeSet(schoolName) {
  const n = String(schoolName || "");
  if (/职业学院|职业技术/.test(n)) return COLLEGE_SETS.vocational;
  if (/医科|医学院|协和|中医药/.test(n)) return COLLEGE_SETS.medical;
  if (/音乐|美术|戏剧|电影|舞蹈|戏曲|服装/.test(n)) return COLLEGE_SETS.art;
  if (/外国语|语言大学|外交/.test(n)) return COLLEGE_SETS.language;
  if (/财经|经贸|工商|物资/.test(n)) return COLLEGE_SETS.finance;
  if (/体育/.test(n)) return COLLEGE_SETS.sports;
  if (/公安|警察|消防/.test(n)) return COLLEGE_SETS.police;
  if (/工业|理工|航空|交通|邮电|化工|石油|地质|矿业|建筑|印刷/.test(n)) return COLLEGE_SETS.engineering;
  return COLLEGE_SETS.comprehensive;
}

function collegesOfSchool(schoolName) {
  const sch = findSchool(schoolName);
  if (sch) return sch.colleges.map((c) => c.name);
  if (String(schoolName || "").trim()) return guessCollegeSet(schoolName);
  const all = [];
  for (const s of SCHOOLS) {
    for (const c of s.colleges) all.push(c.name);
  }
  return uniqueNames(all);
}

function majorsForCollege(collegeName) {
  const n = String(collegeName || "");
  if (!n) return DEFAULT_MAJORS.slice();
  const hit = [];
  const seen = new Set();
  for (const g of MAJOR_GROUPS) {
    if (!g.keys.some((k) => n.includes(k))) continue;
    for (const m of g.majors) {
      if (seen.has(m)) continue;
      seen.add(m);
      hit.push(m);
    }
  }
  return hit.length ? hit : DEFAULT_MAJORS.slice();
}

function paginate(names, q, page, pageSize, filterByQuery = true) {
  const query = String(q || "").trim();
  const filtered = filterByQuery ? names.filter((name) => matchesQuery(name, [], query)) : names;
  const size = Math.min(50, Math.max(1, Number(pageSize) || 20));
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const p = Math.min(pages, Math.max(1, Number(page) || 1));
  const start = (p - 1) * size;
  const list = filtered.slice(start, start + size).map((name) => ({ name }));
  const custom = query.length >= 2 && total === 0 ? query : "";
  return { list, total, page: p, pageSize: size, custom };
}

function queryCampuses(raw) {
  const kind = String((raw && raw.kind) || "school").toLowerCase();
  if (!KINDS.has(kind)) {
    const err = new Error("kind 须为 school、college 或 major");
    err.status = 400;
    throw err;
  }
  const q = String((raw && raw.q) || "").trim();
  const school = String((raw && raw.school) || "").trim();
  const college = String((raw && raw.college) || "").trim();
  const page = raw && raw.page;
  const pageSize = raw && raw.pageSize;
  if (kind === "school") {
    const filtered = q ? SCHOOLS.filter((s) => matchesQuery(s.name, s.aliases, q)).map((s) => s.name) : SCHOOLS.map((s) => s.name);
    return paginate(filtered, q, page, pageSize, false);
  }
  if (kind === "college") {
    return paginate(collegesOfSchool(school), q, page, pageSize);
  }
  return paginate(majorsForCollege(college), q, page, pageSize);
}

module.exports = {
  queryCampuses,
  findSchool,
  collegesOfSchool,
  majorsForCollege,
  SCHOOL_COUNT: SCHOOLS.length,
};
