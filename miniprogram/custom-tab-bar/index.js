const locale = require("../utils/locale");
const { SIZES } = require("../utils/appearance");

const TABS = [
  { pagePath: "/pages/index/index", text: "首页", icon: "/images/home.png", iconOn: "/images/home-on.png" },
  { pagePath: "/pages/activities/activities", text: "活动", icon: "/images/activities.png", iconOn: "/images/activities-on.png" },
  { pagePath: "/pages/orders/orders", text: "行程", icon: "/images/trips.png", iconOn: "/images/trips-on.png" },
  { pagePath: "/pages/mine/mine", text: "我的", icon: "/images/mine.png", iconOn: "/images/mine-on.png" },
];

Component({
  data: {
    selected: 0,
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
      const prefs = look || require("../utils/appearance").read();
      const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
      const route = pages.length ? "/" + pages[pages.length - 1].route : "";
      const selected = Math.max(0, TABS.findIndex((tab) => tab.pagePath === route));
      const scale = SIZES[prefs.size] || 1;
      this.setData({
        selected,
        labelSize: Math.round(22 * scale) + "rpx",
        list: TABS.map((tab) => Object.assign({}, tab, { text: locale.translate(tab.text, prefs.lang) })),
      });
    },
    switchTab(e) {
      const url = e.currentTarget.dataset.path;
      wx.switchTab({ url });
    },
  },
});
