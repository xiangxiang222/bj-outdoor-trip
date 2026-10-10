const { request } = require("../../utils/request");
const { withLocalMedia, detailUrl, shareCover } = require("../../utils/media");
const { resolvePreviewUrls } = require("../../utils/preview");
const { starText } = require("../../utils/labels");

function composeLocalStory(r) {
  if (Array.isArray(r.story) && r.story.length) return r.story;
  const paras = String(r.description || "")
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const photos = (r.gallery || [])
    .map((g) => (typeof g === "string" ? g : (g && (g.src || g.origin || g.thumb)) || ""))
    .filter(Boolean)
    .slice(0, 3);
  const blocks = [];
  paras.forEach((body, i) => {
    blocks.push({ type: "text", body });
    if (photos[i]) blocks.push({ type: "image", url: photos[i] });
  });
  return blocks;
}

function photoUrl(item) {
  if (!item) return "";
  if (typeof item === "string") return item;
  return item.src || item.origin || item.url || item.thumb || "";
}

function shapeRoute(raw) {
  const r = withLocalMedia(raw || {}) || {};
  const story = [];
  let images = 0;
  const saved = Array.isArray(r.story) && r.story.length ? r.story : composeLocalStory(r);
  saved.forEach((block) => {
    if (block && block.type === "image") {
      if (images >= 6 || !block.url) return;
      images += 1;
    }
    story.push(block);
  });
  const used = {};
  story.forEach((block) => {
    if (block.type === "image" && block.url) used[block.url] = true;
  });
  const extraPhotos = [];
  (r.gallery || []).forEach((item) => {
    const url = photoUrl(item);
    if (!url || used[url] || extraPhotos.length >= 6) return;
    used[url] = true;
    extraPhotos.push(typeof item === "string" ? { thumb: url } : item);
  });
  const next = (r.schedules && r.schedules[0]) || null;
  r.story = story;
  r.extraPhotos = extraPhotos;
  r.nextTrip = next;
  r.factDays = r.days ? String(r.days) + "日" : "";
  r.factDifficulty = r.difficulty || "";
  r.factRegion = r.region || "";
  return r;
}

Page({
  data: { r: {}, fromPrice: 0, id: "", err: "", reviews: { list: [], count: 0, avg: 0 }, faqs: [] },
  onLoad(q) {
    this.setData({ id: q.id, r: {}, err: "" });
    wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
    this.load();
  },
  async load() {
    try {
      const res = await request("/routes/" + this.data.id);
      const r = shapeRoute(res.data || {});
      this.setData({
        r,
        fromPrice: ((r.priceTiers && r.priceTiers[0]) || {}).price || 0,
        err: "",
      });
      this.loadReviews();
      this.loadFaqs();
    } catch (err) {
      this.setData({ r: {}, err: (err && err.message) || "线路不存在" });
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
  goGuide(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: "/pages/guide/guide?id=" + id });
  },
  goGuides() {
    wx.navigateTo({ url: "/pages/guides/guides" });
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
  previewStory(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.previewImage({ urls: [url], current: url });
  },
  copyVideo(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: "链接已复制", icon: "none" }),
    });
  },
  previewExtra(e) {
    const index = Number(e.currentTarget.dataset.index) || 0;
    const gallery = this.data.r.extraPhotos || [];
    if (!gallery.length) return;
    this.previewUrls(gallery, index);
  },
  preview(e) {
    const gallery = this.data.r.gallery || [];
    if (gallery.length) {
      this.previewUrls(gallery, Number(e.currentTarget.dataset.index) || 0);
      return;
    }
    const cover = this.data.r.cover;
    if (cover) wx.previewImage({ urls: [cover], current: cover });
  },
  previewUrls(gallery, index) {
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
  goApply() {
    const app = getApp();
    const url = "/pages/route-apply/route-apply";
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent(url) });
      return;
    }
    wx.navigateTo({ url });
  },
  open() {
    wx.navigateTo({ url: "/pages/open/open?id=" + this.data.id });
  },
  onShareAppMessage() {
    const r = this.data.r || {};
    return {
      title: "同行者众 · " + (r.title || "一起出发"),
      path: detailUrl(this.data.id),
      imageUrl: shareCover(r.cover),
    };
  },
  onShareTimeline() {
    return { title: (this.data.r && this.data.r.title) || "同行者众", query: "id=" + this.data.id };
  },
});
