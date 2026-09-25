const { request, setAuth } = require("../../utils/request");
const { baseUrl } = require("../../config");

Page({
  data: { card: null, focus: null, into: 0, span: 0, bar: 0, pill: "", nowLine: "", hasNext: false },
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
  focusLevel(e) {
    this.showCard(this.data.card, Number(e.currentTarget.dataset.level));
  },
  showCard(card, level) {
    if (!card) return;
    const focus = (card.levels || []).find((item) => item.level === Number(level)) || card.levels[0];
    const next = (card.levels || []).find((item) => item.level === focus.level + 1);
    const floor = Number(focus.growth || 0);
    const span = next ? Math.max(1, next.growth - floor) : Math.max(1, floor);
    let into = 0;
    if (focus.level < card.level) into = span;
    else if (focus.level === card.level) into = Math.max(0, Math.min(span, card.growth - floor));
    const bar = Math.round((into / span) * 100);
    let pill = `升级${focus.code}`;
    if (!next && focus.level <= card.level) pill = "已满级";
    else if (focus.level < card.level) pill = "已达到";
    else if (focus.level === card.level) pill = `升级${card.nextCode}`;
    const nowLine = focus.level === card.level ? `当前等级 · ${card.name}` : `${focus.code} · ${focus.name}`;
    this.setData({
      card,
      focus,
      into,
      span,
      bar,
      pill,
      nowLine,
      hasNext: !!next,
      mark: `${baseUrl}/static/member/v${focus.level}.png`,
    });
  },
});
