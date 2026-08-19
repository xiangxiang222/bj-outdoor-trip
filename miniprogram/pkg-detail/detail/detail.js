const { request } = require("../../utils/request");
const details = require("../../data/routes-detail");
const { withLocalMedia, detailUrl, shareCover } = require("../../utils/media");
const { resolvePreviewUrls } = require("../../utils/preview");
const { starText } = require("../../utils/labels");

function localDetail(id) {
  return (Array.isArray(details) ? details : []).find((row) => String(row.id) === String(id)) || null;
}

Page({
  data: { r: {}, fromPrice: 0, id: "", err: "", reviews: { list: [], count: 0, avg: 0 }, faqs: [] },
  onLoad(q) {
    const id = q.id;
    const local = withLocalMedia(localDetail(id) || { id });
    this.setData({
      id,
      r: local,
      fromPrice: local.fromPrice || ((local.priceTiers && local.priceTiers[0]) || {}).price || 0,
    });
    wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
    this.load();
  },
  async load() {
    try {
      const res = await request("/routes/" + this.data.id);
      const remote = res.data || {};
      const local = withLocalMedia(localDetail(this.data.id) || {});
      const r = withLocalMedia(
        Object.assign({}, local, remote, {
          cover: local.cover,
          gallery: local.gallery,
        })
      );
      this.setData({
        r,
        fromPrice: ((r.priceTiers && r.priceTiers[0]) || {}).price || this.data.fromPrice,
        err: "",
      });
      this.loadReviews();
      this.loadFaqs();
    } catch (err) {
      if (!this.data.r.title) {
        this.setData({ err: (err && err.message) || "详情加载失败" });
      }
    }
  },
  async loadFaqs() {
    try {
      const res = await request("/meta");
      this.setData({ faqs: ((res && res.data) || {}).faqs || [] });
    } catch (err) {
      this.setData({ faqs: [] });
    }
  },
  async loadReviews() {
    try {
      const res = await request("/routes/" + this.data.id + "/reviews");
      const data = res.data || {};
      const list = (data.list || []).map((row) => Object.assign({}, row, { stars: starText(row.rating) }));
      this.setData({ reviews: { list, count: data.count || 0, avg: data.avg || 0 } });
    } catch (err) {
      this.setData({ reviews: { list: [], count: 0, avg: 0 } });
    }
  },
  goSch(e) {
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + e.currentTarget.dataset.id });
  },
  goLogin() {
    wx.navigateTo({
      url: "/pages/login/login?redirect=" + encodeURIComponent(detailUrl(this.data.id)),
    });
  },
  async fav() {
    const app = getApp();
    if (!app.globalData.token) {
      this.goLogin();
      return;
    }
    try {
      if (this.data.r.favored) await request("/favorites/" + this.data.id, "DELETE");
      else await request("/favorites/" + this.data.id, "POST");
      const favored = !this.data.r.favored;
      this.setData({ "r.favored": favored });
      wx.showToast({ title: favored ? "已收藏" : "已取消收藏", icon: "none" });
    } catch (e) {
      if (/登录/.test(e.message || "")) {
        this.goLogin();
        return;
      }
      wx.showToast({ title: e.message, icon: "none" });
    }
  },
  preview(e) {
    const index = Number(e.currentTarget.dataset.index) || 0;
    const gallery = this.data.r.gallery || [];
    if (!gallery.length) return;
    wx.showLoading({ title: "加载原图", mask: true });
    resolvePreviewUrls(gallery)
      .then((urls) => {
        wx.hideLoading();
        const current = urls[index] || urls[0];
        wx.previewImage({ urls, current });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: "原图加载失败", icon: "none" });
      });
  },
  open() {
    wx.navigateTo({ url: "/pages/open/open?id=" + this.data.id });
  },
  onShareAppMessage() {
    const r = this.data.r || {};
    return {
      title: "北野行 · " + (r.title || "一起出发"),
      path: detailUrl(this.data.id),
      imageUrl: shareCover(r.cover),
    };
  },
  onShareTimeline() {
    return { title: (this.data.r && this.data.r.title) || "北野行", query: "id=" + this.data.id };
  },
});
