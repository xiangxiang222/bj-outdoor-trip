const DAY = 86400000;
const DEFAULT_FILTERS = Object.freeze({ time: "any", dateFrom: "", dateTo: "", budgetMax: null, partySize: 1, destination: "", intensity: "any", hostKind: "any", campusScope: "any" });
const ENUMS = { time: ["any", "weekend", "nextweekend", "date", "range"], intensity: ["any", "easy"], hostKind: ["any", "official", "campus", "company", "individual"], campusScope: ["any", "cross"] };
function fail(message) { const error = new Error(message); error.status = 400; throw error; }
function chinaDay(now = Date.now()) { return new Date(Number(now) + 8 * 3600000).toISOString().slice(0, 10); }
function validDay(day) {
  return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day + "T00:00:00Z")) && new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day;
}
function addDays(day, count) { return new Date(Date.parse(day + "T00:00:00Z") + count * DAY).toISOString().slice(0, 10); }
function weekend(time, now) {
  const today = chinaDay(now), dow = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;
  const saturday = addDays(today, (time === "nextweekend" ? 12 : 5) - dow);
  return [saturday < today ? today : saturday, addDays(saturday, 1)];
}
function normalizeFilters(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("请检查找团条件");
  if (Object.keys(raw).some((key) => !Object.hasOwn(DEFAULT_FILTERS, key))) fail("找团条件包含不支持的字段");
  const filters = { ...DEFAULT_FILTERS, ...raw };
  if (typeof filters.dateFrom !== "string" || typeof filters.dateTo !== "string" || filters.dateFrom.length > 10 || filters.dateTo.length > 10) fail("请填写有效的出发日期");
  for (const [key, values] of Object.entries(ENUMS)) if (!values.includes(filters[key])) fail("请选择有效的日期、强度和团型条件");
  if (typeof filters.destination !== "string" || filters.destination.length > 40 || /[\u0000-\u001f]/.test(filters.destination)) fail("目的地请填写40字以内的文字");
  filters.destination = filters.destination.trim();
  if (filters.budgetMax !== null && (typeof filters.budgetMax !== "number" || !Number.isFinite(filters.budgetMax) || filters.budgetMax < 0 || filters.budgetMax > 100000)) fail("每人团费上限请填写0至100000元");
  if (!Number.isInteger(filters.partySize) || filters.partySize < 1 || filters.partySize > 50) fail("同行人数请填写1至50人");
  if (filters.time === "weekend" || filters.time === "nextweekend") [filters.dateFrom, filters.dateTo] = weekend(filters.time, now);
  else if (filters.time === "any") filters.dateFrom = filters.dateTo = "";
  else {
    if (!validDay(filters.dateFrom) || !validDay(filters.dateTo)) fail("请填写有效的出发日期");
    if (filters.time === "date" && filters.dateFrom !== filters.dateTo) fail("单日出发的起止日期应相同");
    if (filters.dateFrom > filters.dateTo) fail("出发日期起始不能晚于结束");
    if (filters.dateFrom < chinaDay(now)) fail("请选择今天或以后的出发日期");
    if (Date.parse(filters.dateTo) - Date.parse(filters.dateFrom) > 366 * DAY) fail("出发日期范围请控制在一年以内");
  }
  if (filters.campusScope === "cross") {
    if (!["any", "campus"].includes(filters.hostKind)) fail("跨校同行请搭配高校团型");
    filters.hostKind = "campus";
  }
  return filters;
}
function cnNumber(value) {
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0, digit = 0;
  for (const char of value) {
    if (Object.hasOwn(digits, char)) digit = digits[char];
    else if (char === "十" || char === "百" || char === "千") { total += (digit || 1) * ({ 十: 10, 百: 100, 千: 1000 }[char]); digit = 0; }
    else if (char === "万") { total = (total + digit || 1) * 10000; digit = 0; }
    else return NaN;
  }
  return total + digit;
}
function negated(message, index) { return /(?:不去|不要|不想去|不想要|不参加|排除|不是|别去|非)$/.test(message.slice(Math.max(0, index - 7), index)); }
function positiveMatch(message, pattern) {
  const regex = new RegExp(pattern, "g"); let match;
  while ((match = regex.exec(message))) if (!negated(message, match.index)) return match;
  return null;
}
function rulesParse(message, destinations = [], now = Date.now()) {
  const filters = { ...DEFAULT_FILTERS }, warnings = [], questions = [], locked = new Set();
  let recognized = false;
  function set(key, value) { filters[key] = value; locked.add(key); recognized = true; }
  const today = chinaDay(now);
  if (/下(?:个)?周末/.test(message)) set("time", "nextweekend");
  else if (/(?:本|这(?:个)?)?周末|星期[六日天]和?星期?[日天]/.test(message)) set("time", "weekend");
  if (/(?:本|这(?:个)?)周末/.test(message) && /下(?:个)?周末/.test(message)) questions.push("暂不支持多个可选周末，请选择一个周末或明确连续的日期范围。");
  const fullMatches = [...message.matchAll(/\b(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/g)];
  const monthMatches = fullMatches.length ? [] : [...message.matchAll(/(\d{1,2})月(\d{1,2})[日号]?/g)];
  const fullDates = fullMatches.map((m) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`);
  const monthDates = monthMatches.map((m) => `${today.slice(0, 4)}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
  const explicitDates = fullDates.length ? fullDates : monthDates;
  const matches = fullMatches.length ? fullMatches : monthMatches;
  const betweenDates = matches.length > 1 ? message.slice(matches[0].index + matches[0][0].length, matches[1].index) : "";
  if (explicitDates.length) {
    if (explicitDates.some((date) => !validDay(date))) questions.push("提到的日期无效，请在修改条件中重新选择。");
    else if (explicitDates.length > 2 || (explicitDates.length === 2 && !/^\s*(?:到|至|[-–~～])\s*$/.test(betweenDates))) questions.push("暂不支持多个可选出发日期，请选择一天或明确连续的日期范围。");
    else {
      let start = explicitDates[0], end = explicitDates[1] || start;
      if (monthDates.length && end < today) { start = (Number(start.slice(0, 4)) + 1) + start.slice(4); end = (Number(end.slice(0, 4)) + 1) + end.slice(4); }
      if (start > end || end < today) questions.push("请确认要出发的日期范围。");
      else { set("time", start === end ? "date" : "range"); set("dateFrom", start); set("dateTo", end); }
    }
  } else if (/大后天|后天|明天|今天/.test(message)) {
    const offset = /大后天/.test(message) ? 3 : /后天/.test(message) ? 2 : /明天/.test(message) ? 1 : 0;
    set("time", "date"); set("dateFrom", addDays(today, offset)); set("dateTo", filters.dateFrom);
  } else {
    const day = message.match(/(下|本|这)?(?:周|星期)([一二三四五六日天])/);
    if (day) {
      const target = "一二三四五六日".indexOf(day[2] === "天" ? "日" : day[2]);
      const dow = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;
      const delta = target - dow + (day[1] === "下" || filters.time === "nextweekend" ? 7 : 0);
      if (delta < 0) questions.push("本周的这个日期已过，请确认具体出发日期。");
      else { set("time", "date"); set("dateFrom", addDays(today, delta)); set("dateTo", filters.dateFrom); }
    } else if (/下周|本周|这周/.test(message) && filters.time === "any") {
      const dow = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;
      set("time", "range"); set("dateFrom", /下周/.test(message) ? addDays(today, 7 - dow) : today); set("dateTo", /下周/.test(message) ? addDays(today, 13 - dow) : addDays(today, 6 - dow));
    }
  }
  const number = "[0-9零一二两三四五六七八九十百千万]+(?:\\.[0-9]+)?";
  const totalBudget = /总预算|整团预算|总共预算|预算总共|总花费|总费用|总支出|总金额|(?:总计|一共|总共|合计)[^，。！？]{0,12}[0-9零一二两三四五六七八九十百千万]/.test(message);
  const budget = message.match(new RegExp(`(?:预算|团费|人均|每人|不超过|最多|上限|[¥￥])\\s*(?:是|为|不超过|最多|上限|控制在|[¥￥])?\\s*(${number})\\s*(?:元|块)?`)) || message.match(new RegExp(`(${number})\\s*(?:元|块)\\s*(?:以内|以下|内|封顶|[/每]人)`));
  if (totalBudget) questions.push("你说的是整团总预算，请确认每人的团费上限。");
  else if (budget) { const amount = cnNumber(budget[1]); if (Number.isFinite(amount) && amount <= 100000) set("budgetMax", amount); else questions.push("每人团费上限暂支持0至100000元，请修改后再查找。"); }
  if (!totalBudget && new RegExp(`(?:人均|每人|预算|团费)\\s*${number}\\s*(?:元|块)?\\s*(?:到|至|[-–~～])\\s*${number}`).test(message)) questions.push("暂时按单个团费上限筛选，请把预算范围改成每人团费上限。");
  if (positiveMatch(message, "免费(?:团)?|零团费|0元团费")) set("budgetMax", 0);
  if (!totalBudget && !budget && /[0-9零一二两三四五六七八九十百千]+\s*(?:元|块)|预算|团费上限/.test(message) && filters.budgetMax === null) questions.push("请确认每人的团费上限，例如「每人200元内」。");
  const people = message.match(new RegExp(`(${number})\\s*(?:个)?(?:人|位)(?:同行|一起|出发|参加)?`));
  if (people) {
    const count = cnNumber(people[1]);
    if (Number.isInteger(count) && count >= 1 && count <= 50) set("partySize", count);
    else questions.push("同行人数暂支持1至50人，请在修改条件中确认。");
  } else if (/一个人|独自|单人/.test(message)) set("partySize", 1);
  if (positiveMatch(message, "新手|入门|轻松|休闲|轻徒步") || /不要太累|别太累|不想太累|不爬高山|少走路/.test(message)) set("intensity", "easy");
  const host = [["official", "官方"], ["company", "公司团|企业团|公司团建|企业团建"], ["campus", "校园团|高校团|学生团|跨校|高校联谊"], ["individual", "个人团|个人拼团"]];
  for (const [kind, expression] of host) if (positiveMatch(message, expression)) set("hostKind", kind);
  if (positiveMatch(message, "跨校|高校联谊|外校")) { set("hostKind", "campus"); set("campusScope", "cross"); }
  if (positiveMatch(message, "跨校|高校联谊|外校") && positiveMatch(message, "官方|公司团|企业团|公司团建|企业团建|个人团|个人拼团")) questions.push("跨校同行和所选团型有冲突，请确认是参加高校团还是其他团型。");
  const terms = [...new Set([...destinations, "长城", "怀柔", "密云", "平谷", "延庆", "昌平", "房山", "张家口", "古北水镇", "慕田峪", "草原", "海边", "海滨", "北戴河", "承德", "十渡", "五台山", "山水", "登山", "徒步"])].filter((s) => typeof s === "string" && s.length >= 2 && s.length <= 40).sort((a, b) => b.length - a.length);
  for (const term of terms) {
    const index = message.indexOf(term);
    if (index >= 0 && !negated(message, index)) { set("destination", term); break; }
  }
  const anyDestination = /(?:去(?:哪儿|哪里|什么地方)|目的地).{0,6}(?:不限|随便|都行|都可以)|去(?:哪儿|哪里|什么地方)(?:都)?(?:行|可以)|(?:想去|去|前往)(?:随便|都行|都可以)/.test(message);
  if (!filters.destination && !anyDestination && /(?:想去|去|前往|目的地(?:是|为)?)[\s]*[\u4e00-\u9fffA-Za-z]{2,16}/.test(message) && !/不去|不要去|不想去|别去/.test(message)) questions.push("还没确认要去的目的地，请在修改条件中填写目的地后再查找。");
  const negatives = message.match(/(?:不去|不要|不想|不参加|不选|不考虑|排除|除了|除开|别去|非(?!常))([^，。！？、\s]{2,12})/g) || [];
  if (negatives.some((s) => !/(?:不要|不想)太累/.test(s))) questions.push("描述里有排除条件，目前请在修改条件中选定想去的目的地或团型后再查找。");
  const campusRestriction = [...message.matchAll(/(?:仅限|限于|只限|只要|只接受|限定|限)([^，。！？\s]{1,24})/g)]
    .some((m) => /大|师|院|校/.test(m[1].replace(/高校团|校园团|学生团|高校联谊|高校同行|跨校团|跨校同行/g, "")));
  if (/北航|北理|清华|北大|北京大学|大学|学院|专业|本校|同校|指定学校/.test(message) || campusRestriction) {
    warnings.push("学校、学院和专业资格按账号认证及本团范围核验；简称不会自动扩展为报名权限。");
    questions.push("暂时不能按指定学校、学院或专业筛团；可修改为高校团条件，再在详情核实报名范围。");
  }
  if (/天气|下雨|安全|保证|适合孩子|儿童|老人|孕妇|膝盖|心脏|病/.test(message)) warnings.push("天气、身体适应性和特殊人群要求需向领队核实，本次只按团期与线路资料找团。");
  if (/晴天|不下雨|天气好|晴朗|必须安全|保证安全|不爬高山/.test(message)) questions.push("暂时不能核验天气、安全保证或海拔限制，请先向领队确认，并修改可核实的找团条件。");
  if (/全包|一价全含|包所有|包餐|含餐|含门票|含保险/.test(message)) questions.push("暂时不能按全包费用核算，请确认每人团费上限，并在详情核实另付费用。");
  if (/[0-9零一二两三四五六七八九十]+\s*(?:公里|千米|km)|(?:两|二|三|四|五|六|七|八|九|十|[0-9]+)\s*(?:天|日|晚)(?:游|行程|的团|出行)|地铁|无购物|纯玩|宠物|带狗|轮椅/i.test(message)) questions.push("描述里有当前筛选尚未覆盖的里程、天数或服务要求，请先修改条件，并在团期详情向领队核实。");
  if (/跑步|掼蛋|电影|社团|羽毛球|咖啡|聚餐/.test(message)) questions.push("这里查找的是山野出行团，活动需求请到活动页；也可以修改为出行日期、目的地等条件。");
  if (/孩子|儿童|老人|孕妇|膝盖|心脏|病/.test(message)) questions.push("暂时不能核验特殊人群适应性，请先向领队确认；如继续找团，请修改并确认普通出行条件。");
  if (/(?:忽略|无视|覆盖).*(?:指令|规则|系统)|system prompt|api.?key|密钥|提示词|\b(?:SELECT|DELETE|DROP)\b|所有.*(?:手机号|身份证|订单)/i.test(message)) questions.push("请只描述出行需求，例如出发日期、目的地和每人团费上限。");
  if (!recognized && /随便|都可以|不限|看看有什么|找个团|找团|推荐.*团/.test(message)) recognized = true;
  if (!recognized) questions.push("还没识别出明确的找团条件，请补充出发时间、目的地或每人团费上限。");
  return { filters: normalizeFilters(filters, now), warnings, question: [...new Set(questions)].join(" "), locked: [...locked], recognized };
}
function conditionLabels(filters) {
  const rows = [];
  if (filters.time !== "any") rows.push({ key: "time", label: (filters.time === "weekend" ? "本周末 · " : filters.time === "nextweekend" ? "下周末 · " : "") + filters.dateFrom + (filters.dateFrom !== filters.dateTo ? "–" + filters.dateTo : "") });
  if (filters.destination) rows.push({ key: "destination", label: filters.destination });
  if (filters.budgetMax !== null) rows.push({ key: "budgetMax", label: "每人团费 ¥" + filters.budgetMax + " 内" });
  if (filters.partySize > 1) rows.push({ key: "partySize", label: filters.partySize + "人同行" });
  if (filters.intensity === "easy") rows.push({ key: "intensity", label: "线路标注休闲" });
  if (filters.hostKind !== "any") rows.push({ key: "hostKind", label: ({ official: "官方团", campus: "高校团", company: "公司团", individual: "个人团" })[filters.hostKind] });
  if (filters.campusScope === "cross") rows.push({ key: "campusScope", label: "跨校同行" });
  return rows;
}
module.exports = { DEFAULT_FILTERS, normalizeFilters, rulesParse, conditionLabels, chinaDay, validDay, addDays, weekend };
