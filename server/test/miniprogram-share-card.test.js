const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const miniRoot = path.resolve(__dirname, "../../miniprogram");

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function clock() {
  let now = 0, serial = 0;
  const timers = new Map();
  return {
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const entry = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [id, timer] = entry;
        now = timer.at;
        timers.delete(id);
        timer.fn();
      }
      now = end;
    },
  };
}

// Model the native Canvas 2D contract: a path string or an undecoded image is
// invalid, and resizing a shared canvas clears its drawing before export.
function canvasHarness(options = {}) {
  const time = clock();
  const downloads = [], images = [], exports = [], nodes = new Map();
  function canvas(id) {
    if (nodes.has(id)) return nodes.get(id);
    let ops = [];
    const ctx = {
      setTransform() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {},
      fillRect(...args) { ops.push({ kind: "rect", color: this.fillStyle, args }); },
      fillText(text, ...args) { ops.push({ kind: "text", text, args }); },
      drawImage(image, ...args) {
        assert.equal(typeof image, "object", "Canvas 2D drawImage requires a native Image, not a path");
        assert.ok(images.includes(image) && image.loaded, "decode must finish before drawing");
        ops.push({ kind: "image", src: image.src, args });
      },
    };
    const node = {
      id,
      set width(value) { this._width = value; ops = []; },
      get width() { return this._width; },
      set height(value) { this._height = value; ops = []; },
      get height() { return this._height; },
      getContext(kind) { assert.equal(kind, "2d"); return ctx; },
      snapshot() { return structuredClone(ops); },
      createImage() {
        let src;
        const image = {
          width: 0, height: 0, loaded: false,
          get src() { return src; },
          set src(value) {
            src = value;
            if (options.decode === "hang") return;
            Promise.resolve().then(() => {
              if (options.decode === "fail") return image.onerror(new Error("bad image"));
              image.width = 1200;
              image.height = 800;
              image.loaded = true;
              image.onload();
            });
          },
        };
        images.push(image);
        return image;
      },
    };
    nodes.set(id, node);
    return node;
  }
  const wx = {
    getSystemInfoSync: () => ({ pixelRatio: options.pixelRatio === undefined ? 2 : options.pixelRatio }),
    getImageInfo(request) {
      downloads.push(request);
      if (options.download === "hang") return;
      if (options.download === "fail") return request.fail(new Error("download failed"));
      request.success({ path: "wxfile://download-" + downloads.length + ".jpg" });
    },
    createSelectorQuery() {
      let id;
      return {
        in() { return this; }, select(value) { id = value; return this; }, fields() { return this; },
        exec(callback) { callback([{ node: canvas(id) }]); },
      };
    },
    canvasToTempFilePath(request) {
      const index = exports.length + 1;
      const item = { request, ops: request.canvas.snapshot(), path: "wxfile://share-" + index + ".png" };
      exports.push(item);
      if (options.holdExports) return;
      if (options.exportFail) request.fail(new Error("export failed"));
      else request.success({ tempFilePath: item.path });
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(miniRoot, "utils/share-card.js"), "utf8"), {
    module, wx, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
  });
  return { ...module.exports, time, downloads, images, exports, nodes };
}

const facts = { title: "蔚县青崖子环穿一日", cover: "https://example.test/cover.jpg", price: 3, free: false };
function assertCompleteCard(ops) {
  const text = ops.filter((op) => op.kind === "text").map((op) => op.text);
  assert.ok(text.includes(facts.title));
  assert.ok(text.includes("¥3"));
  assert.ok(text.includes("立即报名"));
}

describe("native share image rendering", () => {
  it("decodes the downloaded cover into a native Image before drawing and exporting a complete 5:4 card", async () => {
    const h = canvasHarness();
    assert.equal(await h.drawShareCard({}, facts), "wxfile://share-1.png");
    assert.equal(h.downloads[0].src, facts.cover);
    assert.equal(h.images[0].src, "wxfile://download-1.jpg");
    assert.equal(h.exports[0].ops.filter((op) => op.kind === "image").length, 1);
    assert.equal(h.exports[0].request.canvas.width / h.exports[0].request.canvas.height, 5 / 4);
    assertCompleteCard(h.exports[0].ops);
  });

  it("loads a base64 QR directly, waits for both native Images, then exports the poster", async () => {
    const h = canvasHarness();
    const qr = "data:image/png;base64,aGVsbG8=";
    assert.equal(await h.drawSharePoster({}, facts, qr), "wxfile://share-1.png");
    assert.equal(h.downloads.length, 1, "getImageInfo must not receive a data URI");
    const drawn = h.exports[0].ops.filter((op) => op.kind === "image");
    assert.equal(drawn.length, 2);
    assert.equal(drawn[1].src, qr);
    assert.ok(h.exports[0].ops.some((op) => op.kind === "text" && op.text === "扫码报名"));
  });

  for (const pixelRatio of [1, 2, 3, 4]) {
    it(`exports bounded, correctly proportioned card and poster images on a ${pixelRatio}x device`, async () => {
      const h = canvasHarness({ pixelRatio });
      await h.drawShareCard({}, facts);
      await h.drawSharePoster({}, facts, "data:image/png;base64,aGVsbG8=");
      assert.equal(h.exports.length, 2);
      for (const [index, aspectRatio, imageCount] of [[0, 5 / 4, 1], [1, 375 / 490, 2]]) {
        const { request, ops } = h.exports[index];
        const { canvas } = request;
        assert.ok(canvas.width > 0 && canvas.width <= 1365, "Canvas 2D width must stay within the native limit");
        assert.ok(canvas.height > 0 && canvas.height <= 1365, "Canvas 2D height must stay within the native limit");
        assert.equal(canvas.width / canvas.height, aspectRatio);
        assert.equal(request.width, canvas.width, "export must read the complete rendered canvas");
        assert.equal(request.height, canvas.height, "export must read the complete rendered canvas");
        assert.equal(request.destWidth, canvas.width, "export must not multiply the device pixel ratio again");
        assert.equal(request.destHeight, canvas.height, "export must not multiply the device pixel ratio again");
        assert.equal(ops.filter((op) => op.kind === "image").length, imageCount);
      }
      assert.ok(h.images.every((image) => image.loaded), "cover and QR must finish native decoding before export");
    });
  }

  for (const failure of [{ download: "fail" }, { decode: "fail" }]) {
    it(`keeps the title, price, CTA and a visible branded cover when ${Object.keys(failure)[0]} fails`, async () => {
      const h = canvasHarness(failure);
      await h.drawShareCard({}, facts);
      assertCompleteCard(h.exports[0].ops);
      assert.equal(h.exports[0].ops.filter((op) => op.kind === "image").length, 0);
      assert.ok(h.exports[0].ops.some((op) => op.kind === "rect" && op.color === "#1b4332"));
      assert.ok(h.exports[0].ops.some((op) => op.kind === "text" && op.text.includes("同行者众")));
    });
  }

  for (const stalled of [{ download: "hang" }, { decode: "hang" }]) {
    it(`finishes a complete fallback card when ${Object.keys(stalled)[0]} never calls back`, async () => {
      const h = canvasHarness(stalled);
      const pending = h.drawShareCard({}, facts);
      await flush();
      h.time.tick(1199);
      await flush();
      assert.equal(h.exports.length, 0);
      h.time.tick(1);
      await pending;
      assertCompleteCard(h.exports[0].ops);
      if (stalled.download) {
        h.downloads[0].success({ path: "wxfile://late.jpg" });
        await flush();
        assert.equal(h.images.length, 0, "late download must not restart decoding");
      }
      assert.equal(h.exports.length, 1);
    });
  }

  it("rejects a poster with an unavailable QR instead of saving an unusable registration poster", async () => {
    const h = canvasHarness({ decode: "fail" });
    await assert.rejects(h.drawSharePoster({}, facts, "data:image/png;base64,aGVsbG8="), /QR image unavailable/);
    assert.equal(h.exports.length, 0);
  });

  it("serializes repeated renders through export so the second render cannot clear the first canvas", async () => {
    const h = canvasHarness({ holdExports: true });
    const page = {};
    const first = h.drawShareCard(page, facts);
    const second = h.drawShareCard(page, { ...facts, title: "周末掼蛋局", free: true });
    await flush();
    assert.equal(h.exports.length, 1);
    assert.equal(h.downloads.length, 1);
    assertCompleteCard(h.exports[0].ops);
    h.exports[0].request.success({ tempFilePath: h.exports[0].path });
    await first;
    await flush();
    assert.equal(h.exports.length, 2);
    assert.ok(h.exports[1].ops.some((op) => op.kind === "text" && op.text === "周末掼蛋局"));
    assert.ok(h.exports[1].ops.some((op) => op.kind === "text" && op.text === "免费"));
    h.exports[1].request.success({ tempFilePath: h.exports[1].path });
    await second;
  });
});

function pageHarness() {
  const filename = path.join(miniRoot, "pages/schedule/schedule.js");
  const localRequire = createRequire(filename);
  const time = clock();
  const renders = [], requests = [], refs = [];
  const fallback = "/images/share-card.png";
  let definition;
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    require(id) {
      if (id === "../../utils/request") return { request(url) { const task = deferred(); requests.push({ url, ...task }); return task.promise; } };
      if (id === "../../utils/share-card") return {
        FALLBACK_SHARE_CARD: fallback,
        drawShareCard(page, value) { const task = deferred(); renders.push({ facts: value, ...task }); return task.promise; },
      };
      if (id === "../../utils/share-scene") return { persistRef(id, ref) { refs.push({ id, ref }); return ref; } };
      return localRequire(id);
    },
    Page(value) { definition = value; },
    getApp: () => ({ globalData: { token: "test" } }),
    wx: { nextTick(callback) { callback(); } },
    setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
  }, { filename });
  const page = { ...definition, data: structuredClone(definition.data) };
  page.setData = function (value, callback) { Object.assign(this.data, value); if (callback) callback(); };
  page.data.id = "10";
  page.data.ref = "source";
  const row = { route: { title: facts.title, cover: facts.cover }, gallery: [], quote: { price: 3, originPrice: 3 }, joinCode: "private-code" };
  page.data.s = row;
  return { page, row, renders, requests, refs, fallback, time };
}

describe("native schedule sharing readiness", () => {
  it("waits for the first card and shares the same title, path and image after rendering completes", async () => {
    const h = pageHarness();
    h.page.prepareShare(h.row);
    const initial = h.page.onShareAppMessage();
    assert.equal(initial.imageUrl, h.fallback);
    assert.equal(typeof initial.promise.then, "function");
    await flush();
    h.renders[0].resolve("wxfile://complete.png");
    const ready = await initial.promise;
    const repeated = h.page.onShareAppMessage();
    assert.equal(ready.imageUrl, "wxfile://complete.png");
    assert.equal(repeated.imageUrl, ready.imageUrl);
    assert.equal(repeated.title, ready.title);
    assert.equal(repeated.path, ready.path);
    assert.match(ready.path, /ref=source&joinCode=private-code/);
    assert.match(ready.title, /¥3 立即报名/);
    assert.equal(repeated.promise, undefined);
  });

  it("uses the same prepared card and complete fallback for timeline sharing", async () => {
    const h = pageHarness();
    h.page.prepareShare(h.row);
    const initial = h.page.onShareTimeline();
    assert.equal(initial.imageUrl, h.fallback);
    assert.equal(initial.query, "id=10&ref=source");
    await flush();
    h.renders[0].resolve("wxfile://timeline.png");
    assert.equal((await initial.promise).imageUrl, "wxfile://timeline.png");
    assert.equal(h.page.onShareTimeline().imageUrl, "wxfile://timeline.png");
  });

  it("reuses a pending and completed render for unchanged facts", async () => {
    const h = pageHarness();
    const first = h.page.prepareShare(h.row);
    assert.equal(h.page.prepareShare(structuredClone(h.row)), first);
    await flush();
    assert.equal(h.renders.length, 1);
    h.renders[0].resolve("wxfile://cached.png");
    await first;
    assert.equal(h.page.prepareShare(structuredClone(h.row)), first);
    assert.equal(h.page.data.shareCardPath, "wxfile://cached.png");
    await flush();
    assert.equal(h.renders.length, 1);
  });

  it("ignores an older render and metadata response after facts change", async () => {
    const h = pageHarness();
    const old = h.page.prepareShare(h.row);
    const changed = { ...h.row, quote: { price: 0, originPrice: 0 }, route: { ...h.row.route, title: "同城掼蛋局" } };
    h.page.data.s = changed;
    const current = h.page.prepareShare(changed);
    await flush();
    h.renders[1].resolve("wxfile://new.png");
    h.requests[1].resolve({ data: { referralCode: "new-ref", qr: "new-qr" } });
    await current;
    h.renders[0].resolve("wxfile://old.png");
    h.requests[0].resolve({ data: { referralCode: "old-ref", qr: "old-qr" } });
    await old;
    await flush();
    assert.equal(h.page.data.shareCardPath, "wxfile://new.png");
    assert.equal(h.page.data.ref, "new-ref");
    assert.equal(h.page.data.posterQr, "new-qr");
    assert.equal(h.refs.length, 1);
    assert.equal(h.page.onShareAppMessage().title, "同城掼蛋局 免费报名");
  });

  it("uses a packaged complete card when export fails", async () => {
    const h = pageHarness();
    h.page.prepareShare(h.row);
    const sharing = h.page.onShareAppMessage();
    await flush();
    h.renders[0].reject(new Error("canvas export failed"));
    assert.equal((await sharing.promise).imageUrl, h.fallback);
    assert.equal(h.page.onShareAppMessage().imageUrl, h.fallback);
  });

  it("resolves to the packaged card before WeChat's three-second limit if export stalls", async () => {
    const h = pageHarness();
    h.page.prepareShare(h.row);
    const sharing = h.page.onShareAppMessage();
    await flush();
    h.time.tick(2400);
    const result = await sharing.promise;
    assert.equal(result.imageUrl, h.fallback);
    assert.equal(result.title, sharing.title);
    assert.equal(result.path, sharing.path);
    h.renders[0].resolve("wxfile://late.png");
    await flush();
    assert.equal(result.imageUrl, h.fallback, "a late export cannot mutate an already shared payload");
  });

  it("does not write an unloaded page when rendering or metadata finishes late", async () => {
    const h = pageHarness();
    const pending = h.page.prepareShare(h.row);
    await flush();
    h.page.onUnload();
    h.renders[0].resolve("wxfile://after-unload.png");
    h.requests[0].resolve({ data: { referralCode: "late-ref", qr: "late-qr" } });
    await pending;
    await flush();
    assert.equal(h.page.data.shareCardPath, "");
    assert.equal(h.page.data.ref, "source");
    assert.equal(h.refs.length, 0);
  });

  it("ships the offline fallback as an actual PNG in the code package", () => {
    const h = pageHarness();
    const file = path.join(miniRoot, h.fallback);
    const png = fs.readFileSync(file);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16) / png.readUInt32BE(20), 5 / 4);
    const project = JSON.parse(fs.readFileSync(path.join(miniRoot, "project.config.json"), "utf8"));
    assert.equal(project.packOptions.ignore.some((rule) => rule.type === "file" && "/" + rule.value === h.fallback), false);
  });
});
