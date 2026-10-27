const locale = require("../../utils/locale");
const { SIZES } = require("../../utils/appearance");

const TABS = [
  { pagePath: "/pages/index/index", text: "首页", icon: "/images/ui/home.png" },
  { pagePath: "/pages/activities/activities", text: "活动", icon: "/images/ui/activities.png" },
  { pagePath: "/pages/orders/orders", text: "行程", icon: "/images/ui/trips.png" },
  { pagePath: "/pages/mine/mine", text: "我的", icon: "/images/ui/mine.png" },
];

Component({
  data: {
    labelSize: "22rpx",
    list: TABS,
  },
  lifetimes: {
    attached() {
      this.refresh();
    },
  },
  methods: {
    refresh(look) {
      const prefs = look || require("../../utils/appearance").read();
      const scale = SIZES[prefs.size] || 1;
      this.setData({
        labelSize: Math.round(22 * scale) + "rpx",
        list: TABS.map((tab) => Object.assign({}, tab, { text: locale.translate(tab.text, prefs.lang) })),
      });
    },
    switchTab(e) {
      wx.switchTab({ url: e.currentTarget.dataset.path });
    },
  },
});
