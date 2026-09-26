const { request } = require("../../utils/request");
const app = getApp();
Page({
  data: { list: [], name: "", phone: "", emergencyName: "", emergencyPhone: "", msg: "" },
  onShow() {
    if (!app.globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/companions/companions") });
      return;
    }
    this.load();
  },
  load() {
    request("/me/companions").then((r) => this.setData({ list: r.data || [] })).catch(() => {});
  },
  setName(e) { this.setData({ name: e.detail.value }); },
  setPhone(e) { this.setData({ phone: e.detail.value }); },
  setEmergencyName(e) { this.setData({ emergencyName: e.detail.value }); },
  setEmergencyPhone(e) { this.setData({ emergencyPhone: e.detail.value }); },
  save() {
    request("/me/companions", "POST", {
      name: this.data.name,
      phone: this.data.phone,
      emergencyName: this.data.emergencyName,
      emergencyPhone: this.data.emergencyPhone,
    }).then((r) => {
      this.setData({ list: r.data || [], name: "", phone: "", emergencyName: "", emergencyPhone: "", msg: "已保存" });
    }).catch((e) => this.setData({ msg: (e && e.message) || "保存失败" }));
  },
  remove(e) {
    request("/me/companions/" + e.currentTarget.dataset.id, "DELETE").then((r) => this.setData({ list: r.data || [] })).catch(() => {});
  },
});
