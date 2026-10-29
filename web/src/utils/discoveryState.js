export function emptyDiscoveryFilters() {
  return { time: "any", dateFrom: "", dateTo: "", budgetMax: null, partySize: 1, destination: "", intensity: "any", hostKind: "any", campusScope: "any" };
}

export function discoveryDraft(filters = {}) {
  const values = { ...emptyDiscoveryFilters(), ...filters };
  return { ...values, budgetMax: values.budgetMax == null ? "" : String(values.budgetMax), partySize: String(values.partySize ?? 1) };
}

function realDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const stamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
}

export function validateDiscoveryDraft(draft, today) {
  const values = { ...emptyDiscoveryFilters(), ...draft };
  const budget = String(values.budgetMax ?? "").trim();
  if (budget && (!Number.isFinite(Number(budget)) || Number(budget) < 0 || Number(budget) > 100000)) return { error: "请填写有效的团费上限，免费可填 0" };
  const size = String(values.partySize ?? "").trim();
  if (!size || !Number.isInteger(Number(size)) || Number(size) < 1 || Number(size) > 50) return { error: "同行人数请填 1 到 50 人" };
  if (["date", "range"].includes(values.time)) {
    if (!realDay(values.dateFrom) || values.dateFrom < today) return { error: "请选择今天或之后的出发日期" };
    if (values.time === "range" && (!realDay(values.dateTo) || values.dateTo < values.dateFrom)) return { error: "结束日期不能早于开始日期" };
  }
  if (!["any", "weekend", "nextweekend", "date", "range"].includes(values.time) || !["any", "easy"].includes(values.intensity) || !["any", "official", "campus", "company", "individual"].includes(values.hostKind) || !["any", "cross"].includes(values.campusScope)) return { error: "请检查筛选条件后重试" };
  return { filters: {
    ...values,
    dateFrom: ["date", "range"].includes(values.time) ? values.dateFrom : "",
    dateTo: values.time === "date" ? values.dateFrom : values.time === "range" ? values.dateTo : "",
    budgetMax: budget === "" ? null : Number(budget), partySize: Number(size), destination: String(values.destination || "").trim().slice(0, 40),
  } };
}

export function mergeDiscoveryResults(previous, incoming) {
  const ids = new Set();
  return [...previous, ...incoming].filter((row) => {
    if (!Number.isInteger(Number(row?.id)) || Number(row.id) <= 0 || ids.has(Number(row.id))) return false;
    ids.add(Number(row.id));
    return true;
  });
}

export function discoveryComparison(row) {
  const missing = "暂未提供";
  const amount = row?.price?.amount;
  return [
    { label: "出发时间", value: row.startDate ? row.startDate + (row.meetupTime ? " · " + row.meetupTime : "") : missing },
    { label: "人均团费", value: amount != null && Number.isFinite(Number(amount)) && Number(amount) >= 0 ? "¥" + amount : missing },
    { label: "行程天数", value: Number(row.days) > 0 ? row.days + " 天" : missing },
    { label: "线路强度", value: row.difficulty || missing },
    { label: "线路标注里程", value: Number(row.distanceKm) > 0 ? row.distanceKm + " km（类型待核实）" : missing },
    { label: "集合地点", value: row.meetupPoint || missing },
    { label: "报名范围", value: row.eligibilityLabel || missing },
    { label: "当前余位", value: row.remain != null && Number.isInteger(Number(row.remain)) && Number(row.remain) >= 0 ? String(row.remain) : missing },
    { label: "参与条件", value: [row.participation?.label, row.participation?.reason].filter(Boolean).join("\n") || missing },
    { label: "费用包含", value: row.feeInclude || missing },
    { label: "费用不含", value: row.feeExclude || missing },
  ];
}
