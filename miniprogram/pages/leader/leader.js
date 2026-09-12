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
    this.setData({ name: e.detail.value });
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
    this.setData({ loading: true });
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
      wx.showToast({ title: (e && e.message) || "提交失败", icon: "none" });
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
