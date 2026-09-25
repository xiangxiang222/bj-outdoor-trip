const { request, setAuth } = require("../../utils/request");

Page({
  data: { card: null, focus: null, focusNext: 0, bar: 0 },
  onShow() {
    if (!getApp().globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/member/member") });
      return;
    }
    this.refresh();
  },
  async refresh() {
    try {
      const me = await request("/me");
      setAuth(getApp().globalData.token, me.data);
      this.showCard(me.data.membership, me.data.membership && me.data.membership.level);
    } catch (e) {
      const user = getApp().globalData.user;
      if (user && user.membership) this.showCard(user.membership, user.membership.level);
    }
  },
  focus(e) {
    this.showCard(this.data.card, Number(e.currentTarget.dataset.level));
  },
  showCard(card, level) {
    if (!card) return;
    const focus = (card.levels || []).find((item) => item.level === Number(level)) || card.levels[0];
    const next = (card.levels || []).find((item) => item.level === focus.level + 1);
    const same = focus.level === card.level;
    const bar = same ? Math.round((card.progress || 0) * 100) : focus.level < card.level ? 100 : 0;
    this.setData({
      card,
      focus,
      focusNext: next ? next.growth : focus.growth,
      bar,
    });
  },
});
