const { request } = require("../../utils/request");
const app = getApp();
Page({
  data: { list: [], name: "", phone: "", emergencyName: "", emergencyPhone: "", msg: "", errors: {} },
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
  setName(e) { this.setData({ name: e.detail.value, "errors.name": "" }); },
  setPhone(e) { this.setData({ phone: e.detail.value, "errors.phone": "" }); },
  setEmergencyName(e) { this.setData({ emergencyName: e.detail.value }); },
  setEmergencyPhone(e) { this.setData({ emergencyPhone: e.detail.value }); },
  save() {
    const errors = {};
    if (!String(this.data.name || "").trim()) errors.name = "请填写姓名";
    const phone = String(this.data.phone || "").trim();
    if (!phone) errors.phone = "请填写手机号";
    else if (!/^1\d{10}$/.test(phone)) errors.phone = "手机号不正确";
    if (Object.keys(errors).length) {
      this.setData({ errors });
      return;
    }
    this.setData({ errors: {} });
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
