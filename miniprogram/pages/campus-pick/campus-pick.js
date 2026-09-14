const { fetchCampuses } = require("../../utils/campus");

function searchPlaceholder(kind) {
  if (kind === "college") return "搜索学院";
  if (kind === "major") return "搜索专业";
  return "搜索学校";
}

function emptyHint(kind, school, college) {
  if (kind === "college" && !String(school || "").trim()) return "请先选择学校，学院按学校列出";
  if (kind === "major" && !String(college || "").trim()) return "请先选择学院，专业按学院列出";
  return "没有匹配项";
}

Page({
  data: {
    kind: "school",
    school: "",
    college: "",
    multiple: false,
    q: "",
    list: [],
    custom: "",
    page: 1,
    pages: 1,
    total: 0,
    loading: false,
    picked: [],
    searchPlaceholder: "搜索学校",
    emptyHint: "没有匹配项",
  },
  onLoad() {
    const opts = (getApp().globalData && getApp().globalData.campusPick) || {};
    const kind = opts.kind || "school";
    wx.setNavigationBarTitle({ title: opts.title || "选择" });
    this.setData({
      kind,
      school: opts.school || "",
      college: opts.college || "",
      multiple: !!opts.multiple,
      picked: opts.selected || [],
      searchPlaceholder: searchPlaceholder(kind),
      emptyHint: emptyHint(kind, opts.school || "", opts.college || ""),
    });
    this.load(1);
  },
  onSearch(e) {
    this.setData({ q: e.detail.value || "" });
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.load(1), 200);
  },
  async load(page) {
    this.setData({ loading: true, page });
    try {
      const res = await fetchCampuses({
        kind: this.data.kind,
        q: this.data.q,
        school: this.data.school,
        college: this.data.college,
        page,
        pageSize: 20,
      });
      const data = res.data || {};
      const picked = this.data.picked || [];
      const list = (data.list || []).map((row) => ({ name: row.name, on: picked.indexOf(row.name) >= 0 }));
      const total = Number(data.total || 0);
      const pageSize = Number(data.pageSize || 20);
      this.setData({
        list,
        custom: data.custom || "",
        total,
        page: Number(data.page || page),
        pages: Math.max(1, Math.ceil(total / pageSize) || 1),
      });
    } catch (e) {
      this.setData({ list: [], custom: (this.data.q || "").trim().length >= 2 ? this.data.q.trim() : "", total: 0, pages: 1 });
    } finally {
      this.setData({ loading: false });
    }
  },
  prev() {
    if (this.data.page > 1) this.load(this.data.page - 1);
  },
  next() {
    if (this.data.page < this.data.pages) this.load(this.data.page + 1);
  },
  markList(picked) {
    return (this.data.list || []).map((row) => ({ name: row.name, on: picked.indexOf(row.name) >= 0 }));
  },
  finish(names) {
    const opts = (getApp().globalData && getApp().globalData.campusPick) || {};
    if (typeof opts.onPick === "function") opts.onPick(names);
    getApp().globalData.campusPick = null;
    wx.navigateBack();
  },
  toggle(e) {
    const name = e.currentTarget.dataset.name;
    if (!this.data.multiple) {
      this.finish([name]);
      return;
    }
    const set = this.data.picked.slice();
    const i = set.indexOf(name);
    if (i >= 0) set.splice(i, 1);
    else set.push(name);
    this.setData({ picked: set, list: this.markList(set) });
  },
  useCustom() {
    const name = this.data.custom;
    if (!name) return;
    if (this.data.multiple) this.finish(this.data.picked.concat([name]));
    else this.finish([name]);
  },
  clear() {
    this.finish([]);
  },
  confirm() {
    this.finish(this.data.picked);
  },
});
