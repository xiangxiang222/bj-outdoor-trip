const { request, showError } = require("../../utils/request");
const { genderText } = require("../../utils/labels");

const ALBUM_MAX = 24;
const PICK_MAX = 9;

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
  data: { u: null, err: "", isSelf: false, remain: 0 },
  onLoad(q) {
    this.userId = q.id;
    this.load(q.id);
  },
  onShow() {
    if (this.userId && this.data.u) this.syncSelf(this.data.u);
  },
  syncSelf(u) {
    const me = getApp().globalData.user || {};
    const isSelf = !!(me.id && u && Number(me.id) === Number(u.id));
    const remain = Math.max(0, ALBUM_MAX - ((u.album || []).length));
    this.setData({ isSelf, remain });
  },
  async load(id) {
    try {
      const res = await request("/users/" + id);
      const u = res.data || {};
      const next = Object.assign({}, u, {
        initial: String(u.nickname || "友").slice(0, 1),
        genderText: genderText(u.gender),
        album: u.album || [],
        trips: u.trips || { upcoming: [], past: [], following: [] },
      });
      this.setData({ u: next, err: "" });
      this.syncSelf(next);
    } catch (e) {
      this.setData({ err: (e && e.message) || "用户不存在" });
      showError("加载失败", e);
    }
  },
  preview(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    const urls = (this.data.u.album || []).map((p) => p.url).filter(Boolean);
    if (!urls.length) return;
    wx.previewImage({ current: urls[index] || urls[0], urls });
  },
  pickPhotos() {
    if (!getApp().globalData.token) {
      wx.navigateTo({ url: "/pages/login/login" });
      return;
    }
    const count = Math.min(PICK_MAX, this.data.remain);
    if (count <= 0) return;
    wx.chooseMedia({
      count,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
      success: (res) => this.uploadPicked(res.tempFiles || []),
    });
  },
  async uploadPicked(files) {
    if (!files.length) return;
    wx.showLoading({ title: "上传中", mask: true });
    try {
      for (const file of files) {
        const url = await uploadFile(file.tempFilePath);
        await request("/me/photos", "POST", { url });
      }
      await this.load(this.userId);
    } catch (e) {
      showError("上传失败", e);
      await this.load(this.userId);
    } finally {
      wx.hideLoading();
    }
  },
  removePhoto(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: "删除这张照片？",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await request("/me/photos/" + id, "DELETE");
          await this.load(this.userId);
        } catch (err) {
          showError("删除失败", err);
        }
      },
    });
  },
  goSch(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: "/pages/schedule/schedule?id=" + id });
  },
  goRoute(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: "/pkg-detail/detail/detail?id=" + id });
  },
});
