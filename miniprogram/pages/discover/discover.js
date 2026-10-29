const { request } = require("../../utils/request");
const { isDark } = require("../../utils/appearance");
const { chinaDay } = require("../../utils/departure-dates");

const EMPTY_FILTERS = {
  time: "any", dateFrom: "", dateTo: "", budgetMax: null, partySize: 1,
  destination: "", intensity: "any", hostKind: "any", campusScope: "any",
};
const EXAMPLES = ["本周末轻徒步", "下周末长城，团费200元内", "想参加跨校团"];
const HOSTS = [
  { key: "any", label: "全部团" }, { key: "official", label: "官方团" },
  { key: "campus", label: "高校团" }, { key: "company", label: "公司团" },
  { key: "individual", label: "个人团" },
];
function validDate(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return false;
  const time = Date.parse(day + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day;
}
function decorate(row) {
  const price = row.price || {};
  const hasPrice = price.amount != null && String(price.amount).trim() !== "" && Number.isFinite(Number(price.amount)) && Number(price.amount) >= 0;
  return Object.assign({}, row, {
    id: Number(row.id), price, hasPrice,
    participation: row.participation || {},
    reasons: Array.isArray(row.reasons) ? row.reasons : [],
    cautions: Array.isArray(row.cautions) ? row.cautions : [],
    compareSelected: false,
  });
}

Page({
  data: {
    examples: EXAMPLES, hosts: HOSTS, message: "", response: null,
    conditions: [], warnings: [], question: "", results: [], total: 0, hasMore: false,
    loading: false, error: "", editError: "", editing: false, comparing: false, compareIds: [], compareRows: [],
    filters: Object.assign({}, EMPTY_FILTERS), draft: Object.assign({}, EMPTY_FILTERS),
    dark: false, hasSearched: false, today: chinaDay(),
  },
  onShow() {
    this._unloaded = false;
    this.setData({ dark: isDark(), today: chinaDay() });
    wx.setNavigationBarTitle({ title: "一句话找团" });
  },
  onUnload() { this._unloaded = true; this._requestId = (this._requestId || 0) + 1; },
  onInput(e) {
    this._requestId = (this._requestId || 0) + 1;
    this.setData({ message: String(e.detail && e.detail.value || "").slice(0, 400), loading: false, error: "" });
  },
  pickExample(e) {
    if (this.data.loading) return Promise.resolve();
    this.setData({ message: String(e.currentTarget.dataset.value || "") });
    return this.submit();
  },
  toggleEdit() {
    if (this.data.loading) return;
    this.setData({ editing: !this.data.editing, draft: Object.assign({}, this.data.filters) });
  },
  setDraft(e) {
    const key = e.currentTarget.dataset.key;
    if (!Object.prototype.hasOwnProperty.call(EMPTY_FILTERS, key)) return;
    const value = e.detail && e.detail.value != null ? e.detail.value : e.currentTarget.dataset.value;
    const patch = { ["draft." + key]: value };
    if (key === "dateFrom" || key === "dateTo") patch["draft.time"] = "range";
    this.setData(patch);
  },
  setDraftChoice(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.currentTarget.dataset.value;
    if (!Object.prototype.hasOwnProperty.call(EMPTY_FILTERS, key)) return;
    const patch = { ["draft." + key]: value };
    if (key === "time") { patch["draft.dateFrom"] = ""; patch["draft.dateTo"] = ""; }
    this.setData(patch);
  },
  clearDate() { this.setData({ "draft.time": "any", "draft.dateFrom": "", "draft.dateTo": "" }); },
  normalizeDraft() {
    const f = Object.assign({}, EMPTY_FILTERS, this.data.draft || {});
    const budgetText = String(f.budgetMax == null ? "" : f.budgetMax).trim();
    if (budgetText && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(budgetText) || !Number.isFinite(Number(budgetText)) || Number(budgetText) > 100000)) throw new Error("团费上限请填写0到100000之间的金额");
    f.budgetMax = budgetText ? Number(budgetText) : null;
    if (!/^\d+$/.test(String(f.partySize)) || Number(f.partySize) < 1 || Number(f.partySize) > 50) throw new Error("同行人数请填写1到50之间的整数");
    f.partySize = Number(f.partySize);
    f.destination = String(f.destination || "").trim().slice(0, 40);
    if (f.time === "any" || f.time === "weekend" || f.time === "nextweekend") { f.dateFrom = ""; f.dateTo = ""; }
    if (f.time === "date") f.dateTo = f.dateFrom || "";
    if (f.time === "date" || f.time === "range") {
      if (!validDate(f.dateFrom) || !validDate(f.dateTo) || f.dateFrom > f.dateTo) throw new Error("请选择完整且先后正确的日期");
      if (f.dateFrom < chinaDay()) throw new Error("出发日期不能早于今天");
    }
    return f;
  },
  applyFilters() {
    if (this.data.loading) return Promise.resolve();
    let filters;
    try { filters = this.normalizeDraft(); }
    catch (err) { this.setData({ editError: err.message }); return Promise.resolve(); }
    this.setData({ editError: "", editing: false });
    return this.search({ filters, message: "", offset: 0 });
  },
  resetFilters() {
    if (this.data.loading) return Promise.resolve();
    this.setData({ editing: false, editError: "" });
    return this.search({ filters: Object.assign({}, EMPTY_FILTERS), message: "", offset: 0 });
  },
  clearCondition(e) {
    const key = e.currentTarget.dataset.key;
    const filters = Object.assign({}, this.data.filters);
    if (key === "time") { filters.time = "any"; filters.dateFrom = ""; filters.dateTo = ""; }
    else if (key === "budget") filters.budgetMax = null;
    else if (key === "scope") { filters.hostKind = "any"; filters.campusScope = "any"; }
    else return Promise.resolve();
    return this.search({ filters, message: "", offset: 0 });
  },
  submit() {
    const message = String(this.data.message || "").trim();
    if (!message) { this._lastRequest = null; this.setData({ error: "先说说想怎么玩" }); return Promise.resolve(); }
    return this.search({ message, filters: null, offset: 0 });
  },
  search(options = {}) {
    if (this.data.loading) return Promise.resolve();
    const requestId = this._requestId = (this._requestId || 0) + 1;
    const body = {
      message: String(options.message || "").slice(0, 400),
      filters: options.filters && typeof options.filters === "object" ? Object.assign({}, options.filters) : null,
      limit: 3, offset: Math.max(0, Number(options.offset) || 0),
    };
    this._lastRequest = JSON.parse(JSON.stringify(body));
    this.setData({ loading: true, error: "" });
    return request("/discovery/search", "POST", body).then((res) => {
      if (this._unloaded || requestId !== this._requestId) return;
      const data = res && res.data ? res.data : {};
      const filters = Object.assign({}, EMPTY_FILTERS, data.filters || body.filters || {});
      const incoming = (Array.isArray(data.results) ? data.results : []).filter((row) => row && Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0).map(decorate);
      const merged = body.offset ? this.data.results.concat(incoming) : incoming;
      const seen = new Set();
      const results = merged.filter((row) => { if (seen.has(row.id)) return false; seen.add(row.id); return true; });
      const compareIds = body.offset ? this.data.compareIds : [];
      results.forEach((row) => { row.compareSelected = compareIds.includes(row.id); });
      this.setData({
        response: data, modelMode: ["model", "ai", "llm"].includes(data.mode), conditions: Array.isArray(data.conditions) ? data.conditions : [],
        warnings: Array.isArray(data.warnings) ? data.warnings : [], question: data.question || "",
        results, total: Number.isFinite(Number(data.total)) ? Number(data.total) : results.length,
        hasMore: Boolean(data.hasMore), filters, draft: Object.assign({}, filters), hasSearched: true,
        loading: false, error: "", compareIds, compareRows: results.filter((row) => compareIds.includes(row.id)), comparing: false,
      });
    }).catch((err) => {
      if (this._unloaded || requestId !== this._requestId) return;
      this.setData({ loading: false, error: err && err.message || "暂时找不到团，请稍后重试" });
    });
  },
  retry() { return this._lastRequest ? this.search(this._lastRequest) : this.submit(); },
  loadMore() {
    if (!this.data.hasMore || this.data.loading) return Promise.resolve();
    const offset = Number(this.data.response && this.data.response.nextOffset);
    return this.search({ filters: this.data.filters, message: "", offset: Number.isFinite(offset) ? offset : this.data.results.length });
  },
  toggleCompare(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id || !this.data.results.some((row) => row.id === id)) return;
    const ids = this.data.compareIds.includes(id) ? this.data.compareIds.filter((item) => item !== id) : this.data.compareIds.length < 3 ? this.data.compareIds.concat(id) : this.data.compareIds;
    const results = this.data.results.map((row) => Object.assign({}, row, { compareSelected: ids.includes(row.id) }));
    this.setData({ compareIds: ids, results, compareRows: results.filter((row) => ids.includes(row.id)) });
  },
  openCompare() { if (this.data.compareIds.length >= 2) this.setData({ comparing: true }); },
  closeCompare() { this.setData({ comparing: false }); },
  noop() {},
  openResult(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (Number.isSafeInteger(id) && id > 0 && this.data.results.some((row) => row.id === id)) wx.navigateTo({ url: "/pages/schedule/schedule?id=" + id });
  },
  backHome() { wx.switchTab({ url: "/pages/index/index" }); },
});
