const { request } = require("../../utils/request");

const MAX = 200;
const EXPERIENCE = [
  { key: "suggest", channel: "experience", label: "功能建议" },
  { key: "enroll", channel: "experience", label: "报名遇到问题" },
  { key: "perf", channel: "experience", label: "性能问题" },
  { key: "other", channel: "experience", label: "其他" },
];
const COMPLAINT = [
  { key: "trip", channel: "complaint", label: "活动体验" },
  { key: "guide", channel: "complaint", label: "领队服务" },
  { key: "refund", channel: "complaint", label: "费用与退款" },
  { key: "safety", channel: "complaint", label: "安全问题" },
];

function uploadFile(filePath) {
  const app = getApp();
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: app.globalData.baseUrl + "/api/upload",
      filePath,
      name: "file",
      header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
      success(res) {
        try {
          const data = JSON.parse(res.data || "{}");
          if (data.ok && data.data && data.data.url) {
            resolve(data.data.url);
            return;
          }
          reject(new Error((data && data.message) || "上传失败"));
        } catch {
          reject(new Error("上传失败"));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || "上传失败"));
      },
    });
  });
}

Page({
  data: {
    channel: "experience",
    shownKinds: EXPERIENCE,
    kind: "",
    content: "",
    images: [],
    remain: MAX,
    canSubmit: false,
    loading: false,
  },
  needLogin() {
    if (getApp().globalData.token) return false;
    wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/feedback/feedback") });
    return true;
  },
  refresh(patch) {
    const next = Object.assign({}, this.data, patch || {});
    const content = String(next.content || "");
    next.remain = Math.max(0, MAX - content.length);
    next.canSubmit = !!(next.kind && content.trim().length >= 4 && !next.loading);
    this.setData(next);
  },
  setChannel(e) {
    const channel = e.currentTarget.dataset.channel === "complaint" ? "complaint" : "experience";
    const shownKinds = channel === "complaint" ? COMPLAINT : EXPERIENCE;
    const kind = shownKinds.some((item) => item.key === this.data.kind) ? this.data.kind : "";
    this.refresh({ channel, shownKinds, kind });
  },
  pickKind(e) {
    this.refresh({ kind: e.currentTarget.dataset.key || "" });
  },
  onInput(e) {
    this.refresh({ content: e.detail.value || "" });
  },
  addImage() {
    if (this.needLogin()) return;
    const left = 3 - this.data.images.length;
    if (left <= 0) return;
    wx.chooseMedia({
      count: left,
      mediaType: ["image"],
      success: async (res) => {
        const files = (res.tempFiles || []).slice(0, left);
        if (!files.length) return;
        wx.showLoading({ title: "上传中", mask: true });
        try {
          const images = this.data.images.slice();
          for (const file of files) {
            if (images.length >= 3) break;
            images.push(await uploadFile(file.tempFilePath));
          }
          this.refresh({ images });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || "上传失败", icon: "none" });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
  removeImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const images = this.data.images.filter((_, i) => i !== index);
    this.refresh({ images });
  },
  preview(e) {
    const current = e.currentTarget.dataset.url;
    wx.previewImage({ current, urls: this.data.images });
  },
  async submit() {
    if (!this.data.canSubmit || this.data.loading) return;
    if (this.needLogin()) return;
    this.refresh({ loading: true });
    try {
      await request("/feedback", "POST", {
        kind: this.data.kind,
        content: this.data.content,
        images: this.data.images,
      });
      wx.showToast({ title: "已收到", icon: "none" });
      this.refresh({ content: "", images: [], loading: false });
    } catch (e) {
      this.refresh({ loading: false });
      wx.showToast({ title: (e && e.message) || "提交失败", icon: "none" });
    }
  },
});
