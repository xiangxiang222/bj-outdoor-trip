const { request } = require("../../utils/request");
const { visitorId, pulsePath, pulseFace } = require("../../utils/pulse");
const appearance = require("../../utils/appearance");

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
    rows: [],
    lane: [0, 0, 0],
    turn: 0,
    visible: false,
    lang: "zh",
  },
  pageLifetimes: {
    show() {
      this.setData({ lang: appearance.read().lang });
    },
  },
  lifetimes: {
    attached() {
      this.setData({ lang: appearance.read().lang });
      this.ready = true;
      this.viewed = false;
      this.load();
      this.ping();
      const pace = (this.data.scope || "home") === "home" ? 2800 : 4000;
      this.rotateTimer = setInterval(() => this.tick(), pace);
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
    homeRows(items, lane) {
      const list = items || [];
      if ((this.data.scope || "home") !== "home" || list.length < 2) return [];
      const lanes = Math.min(3, list.length);
      const rows = [];
      for (let i = 0; i < lanes; i += 1) {
        const bucket = [];
        for (let j = i; j < list.length; j += lanes) bucket.push(list[j]);
        const item = bucket[(lane[i] || 0) % bucket.length];
        rows.push({
          lane: i,
          id: item.id,
          text: item.text,
          face: pulseFace(item.who),
          kind: item.kind,
          routeId: item.routeId,
          scheduleId: item.scheduleId,
        });
      }
      return rows;
    },
    apply() {
      const items = this.data.items || [];
      const current = items[this.data.index] || null;
      const line = (current && current.text) || this.data.watchingText || "";
      const rows = this.homeRows(items, this.data.lane || [0, 0, 0]);
      this.setData({
        line,
        rows,
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
        this.setData({ items, watchingText: data.watchingText || "", index, rows: this.homeRows(items, this.data.lane || [0, 0, 0]) }, () => this.apply());
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
      const items = this.data.items || [];
      const n = items.length;
      if (n < 2) return;
      if ((this.data.scope || "home") === "home") {
        const lanes = Math.min(3, n);
        const laneIndex = this.data.turn % lanes;
        let count = 0;
        for (let i = laneIndex; i < n; i += lanes) count += 1;
        const lane = (this.data.lane || [0, 0, 0]).slice();
        if (count > 1) lane[laneIndex] = (lane[laneIndex] + 1) % count;
        this.setData({ lane, turn: this.data.turn + 1 }, () => this.apply());
        return;
      }
      this.setData({ index: (this.data.index + 1) % n }, () => this.apply());
    },
    go() {
      const items = this.data.items || [];
      const current = items[this.data.index];
      const url = pulsePath(current);
      if (url) wx.navigateTo({ url });
    },
    goRow(e) {
      const lane = Number(e.currentTarget.dataset.lane);
      const row = (this.data.rows || []).find((item) => item.lane === lane);
      const url = pulsePath(row);
      if (url) wx.navigateTo({ url });
    },
  },
});
