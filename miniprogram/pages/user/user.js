const { request, showError } = require("../../utils/request");
const { genderText } = require("../../utils/labels");

Page({
  data: { u: null, err: "" },
  onLoad(q) {
    this.load(q.id);
  },
  async load(id) {
    try {
      const res = await request("/users/" + id);
      const u = res.data || {};
      this.setData({
        u: Object.assign({}, u, {
          initial: String(u.nickname || "友").slice(0, 1),
          genderText: genderText(u.gender),
        }),
        err: "",
      });
    } catch (e) {
      this.setData({ err: (e && e.message) || "用户不存在" });
      showError("加载失败", e);
    }
  },
});
