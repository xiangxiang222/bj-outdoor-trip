const { request, setAuth, showError } = require("../../utils/request");
const { maskPhone } = require("../../utils/labels");
const appearance = require("../../utils/appearance");
const app = getApp();

Page({
  data: { user: {}, phone: "", nickHead: "友", look: {}, copy: {}, nightText: "", langText: "" },
  onShow() {
    const look = appearance.read();
    const copy = appearance.t(look);
    wx.setNavigationBarTitle({ title: copy.settingsTitle });
    this.setData({
      look,
      copy,
      nightText: appearance.nightLabel(look),
      langText: appearance.langLabel(look),
    });
    const cached = app.globalData.user || {};
    const nick = cached.nickname || "";
    this.setData({
      user: cached,
      phone: maskPhone(cached.phone),
      nickHead: nick ? nick.slice(0, 1) : "友",
    });
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/settings/settings") });
      return;
    }
    request("/me")
      .then((res) => {
        setAuth(app.globalData.token, res.data);
        const user = res.data || {};
        const nick = user.nickname || "";
        this.setData({
          user,
          phone: maskPhone(user.phone),
          nickHead: nick ? nick.slice(0, 1) : "友",
        });
      })
      .catch(() => {});
  },
  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },
  toggleText(e) {
    const look = appearance.write({ textMode: !!e.detail.value });
    this.setData({ look, copy: appearance.t(look) });
  },
  out() {
    setAuth("", null);
    wx.switchTab({ url: "/pages/mine/mine" });
  },
  closeAccount() {
    wx.showModal({
      title: "注销账号",
      content: "请先阅读设置中的《账号注销须知》。钱包有余额，或有已支付、尚未出发的行程时，须先完成提现、取消及退款。注销将停用账号并清除部分账号资料；订单、认证材料等历史数据不会因此自动全部删除，需按须知申请处理。同一手机号可以重新注册。确定注销？",
      confirmColor: "#bc4749",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await request("/me", "DELETE");
          setAuth("", null);
          wx.switchTab({ url: "/pages/mine/mine" });
        } catch (e) {
          showError("注销失败", e);
        }
      },
    });
  },
});
