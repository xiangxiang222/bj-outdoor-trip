const { request } = require("../../utils/request");
const { visitorId, pulsePath, pulseFace } = require("../../utils/pulse");

Component({
  properties: {
    scope: { type: String, value: "home" },
    routeId: { type: null, value: 0 },
    scheduleId: { type: null, value: 0 },
    flush: { type: Boolean, value: false },
  },
  data: {
    items: [],
    watchingText: "",
    index: 0,
    line: "",
    face: "同",
    visible: false,
  },
  lifetimes: {
    attached() {
      this.ready = true;
      this.viewed = false;
      this.load();
      this.ping();
      this.rotateTimer = setInterval(() => this.tick(), 4000);
      this.refreshTimer = setInterval(() => this.load(), 60000);
    },
    detached() {
      clearInterval(this.rotateTimer);
      clearInterval(this.refreshTimer);
    },
  },
  observers: {
    "scope, routeId, scheduleId"() {
      if (!this.ready) return;
      this.viewed = false;
      this.setData({ index: 0 });
      this.load();
      this.ping();
    },
  },
  methods: {
    apply() {
      const items = this.data.items || [];
      const current = items[this.data.index] || null;
      const line = (current && current.text) || this.data.watchingText || "";
      this.setData({
        line,
        face: pulseFace(current && current.who),
        visible: !!(items.length || this.data.watchingText),
      });
    },
    async load() {
      try {
        const q = ["scope=" + (this.data.scope || "home"), "visitorId=" + visitorId()];
        if (Number(this.data.routeId)) q.push("routeId=" + Number(this.data.routeId));
        if (Number(this.data.scheduleId)) q.push("scheduleId=" + Number(this.data.scheduleId));
        const res = await request("/live/pulse?" + q.join("&"));
        const data = (res && res.data) || {};
        const items = Array.isArray(data.items) ? data.items : [];
        const index = this.data.index >= items.length ? 0 : this.data.index;
        this.setData({ items, watchingText: data.watchingText || "", index }, () => this.apply());
      } catch (err) {
        this.setData({ items: [], watchingText: "", visible: false });
      }
    },
    async ping() {
      if (this.viewed) return;
      this.viewed = true;
      try {
        await request("/live/view", "POST", {
          scope: this.data.scope,
          routeId: Number(this.data.routeId) || undefined,
          scheduleId: Number(this.data.scheduleId) || undefined,
          visitorId: visitorId(),
        });
      } catch (err) {
        this.viewed = false;
      }
    },
    tick() {
      const n = (this.data.items || []).length;
      if (n < 2) return;
      this.setData({ index: (this.data.index + 1) % n }, () => this.apply());
    },
    go() {
      const items = this.data.items || [];
      const current = items[this.data.index];
      const url = pulsePath(current);
      if (url) wx.navigateTo({ url });
    },
  },
});
