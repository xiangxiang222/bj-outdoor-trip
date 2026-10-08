const { request, setAuth } = require("../../utils/request");
const app = getApp();

Page({
  data: {
    name: "",
    years: 0,
    intro: "",
    certified: false,
    pending: false,
    rejected: false,
    loading: false,
    redirect: "",
    errors: {},
  },
  onLoad(q) {
    this.setData({ redirect: q.redirect || "" });
  },
  onShow() {
    const u = app.globalData.user || {};
    this.setData({
      name: u.leaderName || u.nickname || "",
      years: Number(u.leaderYears || 0),
      intro: u.leaderIntro || "",
      certified: !!u.isLeader,
      pending: u.leaderStatus === "pending",
      rejected: u.leaderStatus === "rejected",
    });
  },
  onName(e) {
    this.setData({ name: e.detail.value, "errors.name": "" });
  },
  onYears(e) {
    this.setData({ years: Number(e.detail.value || 0) });
  },
  onIntro(e) {
    this.setData({ intro: e.detail.value });
  },
  async submit() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/leader/leader") });
      return;
    }
    if (!String(this.data.name || "").trim()) {
      this.setData({ "errors.name": "请填写真实姓名" });
      return;
    }
    this.setData({ loading: true, errors: {} });
    try {
      const res = await request("/me/leader", "POST", {
        name: this.data.name,
        years: this.data.years,
        intro: this.data.intro,
      });
      setAuth(app.globalData.token, res.data);
      this.setData({
        certified: !!res.data.isLeader,
        pending: res.data.leaderStatus === "pending",
        rejected: res.data.leaderStatus === "rejected",
      });
      wx.showToast({ title: res.message || "已提交", icon: "none" });
    } catch (e) {
      wx.showModal({ title: "提交失败", content: (e && e.message) || "请稍后重试", showCancel: false });
    } finally {
      this.setData({ loading: false });
    }
  },
  goBack() {
    const url = this.data.redirect;
    if (url) wx.navigateTo({ url });
    else wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/mine/mine" }) });
  },
});
