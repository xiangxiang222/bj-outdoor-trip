const { request, showError } = require("../../utils/request");
const app = getApp();

const DAY_VALUES = [1, 2, 3, "multi"];
const DAY_LABELS = ["1 日", "2 日", "3 日", "多日"];

function uploadFile(filePath) {
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

function statusText(a) {
  if (a.bountyStatus === "paid") return "已发奖";
  if (a.reviewStatus === "pending") return "审核中";
  if (a.reviewStatus === "rejected") return "未通过";
  return "已通过";
}

Page({
  data: {
    bounty: 300,
    contacts: { officialWechat: "同行者众", officialWechatName: "同行者众官方" },
    apps: [],
    done: "",
    copied: false,
    loading: false,
    dayLabels: DAY_LABELS,
    dayIndex: 0,
    form: {
      title: "",
      subtitle: "",
      region: "",
      days: 1,
      minGroupSize: 10,
      originPrice: 199,
      cover: "",
      description: "",
      contactPhone: "",
      contactWechat: "",
    },
  },
  onShow() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/route-apply/route-apply") });
      return;
    }
    const phone = (app.globalData.user && app.globalData.user.phone) || "";
    if (!this.data.form.contactPhone && phone) {
      this.setData({ "form.contactPhone": phone });
    }
    this.loadApps();
  },
  async loadApps() {
    try {
      const res = await request("/routes/apps");
      const data = (res && res.data) || {};
      const apps = (data.list || []).map((row) => Object.assign({}, row, { statusText: statusText(row) }));
      this.setData({
        apps,
        bounty: data.bounty || this.data.bounty,
        contacts: data.contacts || this.data.contacts,
      });
    } catch (e) {
      showError("加载失败", e);
    }
  },
  onField(e) {
    this.setData({ ["form." + e.currentTarget.dataset.key]: e.detail.value });
  },
  onNumber(e) {
    this.setData({ ["form." + e.currentTarget.dataset.key]: Number(e.detail.value || 0) });
  },
  onDays(e) {
    const i = Number(e.detail.value || 0);
    this.setData({ dayIndex: i, "form.days": DAY_VALUES[i] });
  },
  pickCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
      success: async (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file) return;
        wx.showLoading({ title: "上传中", mask: true });
        try {
          const url = await uploadFile(file.tempFilePath);
          this.setData({ "form.cover": url });
        } catch (e) {
          showError("上传失败", e);
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
  async submit() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/route-apply/route-apply") });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await request("/routes/apply", "POST", this.data.form);
      const data = (res && res.data) || {};
      this.setData({
        done: data.message || "已提交审核",
        contacts: data.contacts || this.data.contacts,
        bounty: data.bounty || this.data.bounty,
        "form.title": "",
        "form.subtitle": "",
        "form.description": "",
        "form.cover": "",
      });
      await this.loadApps();
    } catch (e) {
      showError("提交失败", e);
    } finally {
      this.setData({ loading: false });
    }
  },
  copyWechat() {
    const text = this.data.contacts.officialWechat;
    if (!text) return;
    wx.setClipboardData({
      data: String(text),
      success: () => this.setData({ copied: true }),
    });
  },
});
