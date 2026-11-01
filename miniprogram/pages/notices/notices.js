const { request } = require("../../utils/request");
const app = getApp();

function openHref(href) {
  const text = String(href || "");
  const wish = text.match(/^\/m\/wishes\/([A-Za-z0-9_-]{20,64})$/);
  if (wish) { wx.navigateTo({ url: "/pages/wishes/wishes?token=" + encodeURIComponent(wish[1]) }); return; }
  const sch = text.match(/\/m\/schedule\/(\d+)/);
  if (sch) {
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + sch[1] });
    return;
  }
  if (text.indexOf("/m/orders") === 0) {
    const tab = (text.split("tab=")[1] || "refund").split("&")[0];
    app.globalData.ordersTab = tab;
    wx.switchTab({ url: "/pages/orders/orders" });
    return;
  }
  const pages = {
    "/m/leader": "/pages/leader/leader",
    "/m/student": "/pages/student/student",
    "/m/route-apply": "/pages/route-apply/route-apply",
  };
  if (pages[text]) wx.navigateTo({ url: pages[text] });
}

function emptyCounts() { return { all: 0, unread: 0, read: 0 }; }

Page({
  data: { list: [], unread: 0, counts: emptyCounts(), filter: "all", loading: true, loadingMore: false, readingAll: false, error: "", hasMore: false, nextCursor: null },
  onShow() {
    this._alive = true;
    const token = app.globalData.token;
    if (this._account !== token) {
      this._account = token;
      this.setData({ list: [], unread: 0, counts: emptyCounts(), filter: "all", hasMore: false, nextCursor: null, readingAll: false });
    }
    if (!token) {
      this._requestId = (this._requestId || 0) + 1;
      this.setData({ loading: false });
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/notices/notices") });
      return;
    }
    return this.load();
  },
  onUnload() { this._alive = false; this._requestId = (this._requestId || 0) + 1; },
  validAccount(token) { return this._alive !== false && token === app.globalData.token; },
  async load(more) {
    if (more && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return;
    const token = app.globalData.token;
    if (!token) return;
    const id = (this._requestId || 0) + 1;
    this._requestId = id;
    const filter = this.data.filter;
    const cursor = more ? this.data.nextCursor : null;
    this.setData({ loading: !more, loadingMore: !!more, error: "" });
    const query = "?read=" + filter + (cursor ? "&beforeId=" + cursor : "");
    try {
      const res = await request("/me/notices" + query);
      if (id !== this._requestId || !this.validAccount(token)) return;
      const rows = res.data || [];
      const list = more ? this.data.list.concat(rows.filter(row => !this.data.list.some(item => item.id === row.id))) : rows;
      this.setData({ list, unread: res.unread || 0, counts: res.counts || emptyCounts(), hasMore: !!res.hasMore, nextCursor: res.nextCursor || null });
    } catch (err) {
      if (id === this._requestId && this.validAccount(token)) this.setData({ error: err.message || "消息加载失败，请重试" });
    } finally {
      if (id === this._requestId && this.validAccount(token)) this.setData({ loading: false, loadingMore: false });
    }
  },
  selectFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    if (!["all", "unread", "read"].includes(filter) || filter === this.data.filter) return;
    this.setData({ filter, list: [], hasMore: false, nextCursor: null });
    return this.load();
  },
  retry() { return this.load(); },
  loadMore() { return this.load(true); },
  async readAll() {
    if (this.data.readingAll || !this.data.unread) return;
    const token = app.globalData.token;
    const filter = this.data.filter;
    this.setData({ readingAll: true });
    try {
      const res = await request("/me/notices/read-all", "POST", { read: filter });
      if (!this.validAccount(token)) return;
      this.setData({ unread: res.unread || 0, counts: res.counts || this.data.counts });
      if (filter !== this.data.filter) {
        await this.load();
      } else {
        this._requestId = (this._requestId || 0) + 1;
        this.setData({ list: res.data || [], hasMore: !!res.hasMore, nextCursor: res.nextCursor || null, loading: false, loadingMore: false, error: "" });
      }
    } catch (err) {
      if (this.validAccount(token)) wx.showToast({ title: "标记失败，请重试", icon: "none" });
    } finally {
      if (this.validAccount(token)) this.setData({ readingAll: false });
    }
  },
  async open(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    if (!item || this._opening) return;
    const token = app.globalData.token;
    const filter = this.data.filter;
    this._opening = true;
    try {
      if (item.unread) {
        try {
          const res = await request("/me/notices/" + item.id + "/read", "POST");
          if (!this.validAccount(token)) return;
          this.setData({ unread: res.unread || 0, counts: res.counts || this.data.counts });
          if (filter !== this.data.filter || this.data.loading || this.data.loadingMore) {
            await this.load();
          } else {
            const list = this.data.list.map(row => row.id === item.id ? { ...row, unread: false } : row).filter(row => this.data.filter !== "unread" || row.unread);
            this.setData({ list });
          }
        } catch (err) {
          if (this.validAccount(token)) wx.showToast({ title: "标记失败，请重试", icon: "none" });
        }
      }
      if (this.validAccount(token)) openHref(item.href);
    } finally { this._opening = false; }
  },
});
