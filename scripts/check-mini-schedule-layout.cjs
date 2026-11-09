#!/usr/bin/env node
// Browser compatibility simulation of the actual Mini Program WXML/WXSS and
// canvas renderer. This is not a WeChat simulator or a real-device result.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const output = process.env.MINI_SCHEDULE_ARTIFACT_DIR || "/tmp/bj-schedule-redesign-2026-11-06";
fs.mkdirSync(output, { recursive: true });
const nativeTemplate = fs.readFileSync(path.join(root, "miniprogram/pages/schedule/schedule.wxml"), "utf8");
const nativeChart = fs.readFileSync(path.join(root, "miniprogram/utils/weather-chart.js"), "utf8");
const nativeLocale = fs.readFileSync(path.join(root, "miniprogram/utils/locale.wxs"), "utf8");

function section(className) {
  const opening = new RegExp(`<view\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`).exec(nativeTemplate);
  assert.ok(opening, `Actual WXML is missing ${className}`);
  const start = opening.index;
  const tokens = /<\/?view\b[^>]*>/g;
  tokens.lastIndex = start;
  let depth = 0;
  let token;
  while ((token = tokens.exec(nativeTemplate))) {
    depth += token[0].startsWith("</") ? -1 : token[0].endsWith("/>") ? 0 : 1;
    if (depth === 0) return nativeTemplate.slice(start, tokens.lastIndex);
  }
  throw new Error(`Unclosed actual WXML section: ${className}`);
}

const templates = { roles: section("role-board"), weather: section("trip-weather-card") };
assert.match(templates.roles, /bindtap="applyLeader"/);
assert.match(templates.roles, /bindtap="applyPhotographer"/);
assert.match(templates.roles, /bindtap="openLeader"/);
assert.match(templates.weather, /id="weatherChart"/);

function style(width) {
  const source = ["miniprogram/app.wxss", "miniprogram/pages/schedule/schedule.wxss"]
    .map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  return source.replace(/@import\s+[^;]+;/g, "")
    .replace(/(^|[}\s,])page(?=[\s{:.])/g, "$1.page")
    .replace(/(-?(?:\d+\.?\d*|\.\d+))rpx\b/g, (_, n) => Number(n) * width / 750 + "px");
}

const hours = Array.from({ length: 15 }, (_, i) => ({
  hour: String(6 + i).padStart(2, "0") + ":00",
  temp: [-3, -3, -2, -1, 0, 1, 2, 3, 3, 3, 2, 1, 0, -1, -2][i],
  precip: [0, 0, 0, 0.1, 0, 0, 0, 0, 0, 0, 0.1, 0.3, 0.8, 1.2, 0.6][i],
}));

function fixture(lang, state) {
  const filled = state === "filled";
  const mixed = state === "mixed";
  const leader = n => ({ id: n, userId: n, kind: "user", name: lang === "en" ? "Alexandra Mountain Walker" : "山野同行的领队小林", avatar: "" });
  return {
    lang, isActivity: false,
    s: { startDate: "2026-11-08", leaders: filled ? [leader(1), leader(2)] : [], photographer: filled || mixed ? { ...leader(3), name: lang === "en" ? "Christopher Photographer" : "摄影师阿远" } : null },
    leaderSlots: [1, 2].map(n => ({ slot: n, label: "领队" + n, leader: filled || mixed && n === 1 ? leader(n) : null })),
    weather: {
      place: lang === "en" ? "Zhangjiakou · Qingyazi Mountain Scenic Area" : state === "empty" ? "张家口" : "张家口 · 蔚县青崖子环线风景区",
      date: "2026-11-08", summary: "中雪", tmin: -3.6, tmax: 3.1, wind: 15.9, precip: 2.6,
      hourly: state === "no-hourly" ? [] : hours,
      alerts: [{ text: "有雪，注意防滑和保暖", level: "warn" }, { text: "气温偏低，请加穿防风层", level: "ok" }],
    },
  };
}

async function main() {
  const executablePath = process.env.CHROME_PATH || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : ["/usr/bin/chromium", "/usr/bin/google-chrome"].find(fs.existsSync));
  assert.ok(executablePath && fs.existsSync(executablePath), "Set CHROME_PATH to Chrome/Chromium");
  const browser = await chromium.launch({ executablePath, headless: true });
  const report = { kind: "Browser compatibility simulation; not WeChat simulator or real device", actualSources: ["miniprogram/pages/schedule/schedule.wxml", "miniprogram/pages/schedule/schedule.wxss", "miniprogram/app.wxss", "miniprogram/utils/weather-chart.js"], cases: [], screenshots: [] };
  try {
    for (const width of [320, 390, 430]) for (const scale of [1, 1.36]) for (const lang of ["zh", "en"]) for (const dark of [false, true]) {
      for (const state of ["empty", "filled", "mixed", "no-hourly"]) {
        const id = `${width}-${scale}-${lang}-${dark ? "dark" : "light"}-${state}`;
        const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
        try {
          await page.setContent(`<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
            html,body { margin:0;padding:0;width:100%;font-family:Arial,"PingFang SC",sans-serif; }
            view { display:block; } text { display:inline; } block { display:contents; }
            button { box-sizing:border-box; font:inherit; }
            ${style(width)}
            .page { --ui-scale:${scale};--primary:#5b3b8c;--primary-soft:#efeaf7;--bg:${dark ? "#121214" : "#f6f5f8"};--card:${dark ? "#1c1c1e" : "#fff"};--ink:${dark ? "#f2f2f2" : "#24222a"};--muted:${dark ? "#9a9a9a" : "#8a8692"};--line:${dark ? "#2c2c2e" : "#eeecf2"};min-height:100vh;padding:18px 0;box-sizing:border-box; }
            .preview-label { margin:0 16px 14px;color:var(--muted);font-size:11px;line-height:1.5; }
          </style><body><view class="page"><view class="schedule-page${dark ? " detail-dark" : ""}"><view class="preview-label">浏览器兼容模拟 · 非微信真机 / Browser simulation</view><view id="roles" class="card"><view class="pad"></view></view><view id="weather"></view></view></view></body></html>`);
          const data = fixture(lang, state);
          await page.addScriptTag({ content: `(function(){const module={exports:{}};const getRegExp=(source,flags)=>new RegExp(source,flags);${nativeLocale};window.NativeLocale=module.exports;})();` });
          const bindings = await page.evaluate(({ templates, data }) => {
            const ctx = { ...data, tr: window.NativeLocale };
            const evaluate = (expression, scope) => {
              try { return Function("scope", `with(scope){return (${expression})}`)(scope); }
              catch (error) { throw new Error(`Actual WXML binding failed: ${expression}: ${error.message}`); }
            };
            const value = (source, scope) => {
              const exact = /^\s*{{([\s\S]*?)}}\s*$/.exec(source || "");
              return exact ? evaluate(exact[1], scope) : source;
            };
            const interpolate = (source, scope) => source.replace(/{{([\s\S]*?)}}/g, (_, expression) => { const result = evaluate(expression, scope); return result == null ? "" : String(result); });
            function children(parent, scope) {
              const fragment = document.createDocumentFragment();
              let chain = null;
              for (const child of parent.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) { fragment.append(document.createTextNode(interpolate(child.textContent, scope))); continue; }
                if (child.nodeType !== Node.ELEMENT_NODE) continue;
                if (child.hasAttribute("wx:if")) { chain = Boolean(value(child.getAttribute("wx:if"), scope)); if (!chain) continue; }
                else if (child.hasAttribute("wx:elif")) { if (chain) continue; chain = Boolean(value(child.getAttribute("wx:elif"), scope)); if (!chain) continue; }
                else if (child.hasAttribute("wx:else")) { if (chain) continue; chain = true; }
                else chain = null;
                fragment.append(element(child, scope));
              }
              return fragment;
            }
            function element(node, scope, expanded = false) {
              if (!expanded && node.hasAttribute("wx:for")) {
                const fragment = document.createDocumentFragment();
                const items = value(node.getAttribute("wx:for"), scope) || [];
                items.forEach((item, index) => fragment.append(element(node, { ...scope, [node.getAttribute("wx:for-item") || "item"]: item, [node.getAttribute("wx:for-index") || "index"]: index }, true)));
                return fragment;
              }
              const tag = node.tagName.toLowerCase();
              // WXML block is a compile-time container, not a native sibling.
              // Flatten it so real adjacency selectors stay representative.
              if (tag === "block") return children(node, scope);
              const target = document.createElement(tag === "image" ? "img" : tag);
              for (const attr of node.attributes) {
                if (attr.name.startsWith("wx:")) continue;
                if (attr.name === "bindtap" || attr.name === "catchtap") { target.setAttribute("data-native-handler", attr.value); continue; }
                target.setAttribute(attr.name, interpolate(attr.value, scope));
              }
              if (tag !== "image") target.append(children(node, scope));
              return target;
            }
            for (const [key, markup] of Object.entries(templates)) {
              const holder = document.createElement("template");
              holder.innerHTML = markup.replace(/<(image)\b([^>]*?)\s*\/>/g, "<$1$2></$1>");
              const rendered = children(holder.content, ctx);
              document.querySelector(key === "roles" ? "#roles .pad" : "#weather").append(rendered);
            }
            return [...document.querySelectorAll("[data-native-handler]")].map(el => ({ handler: el.dataset.nativeHandler, text: el.textContent.trim(), slot: el.dataset.slot }));
          }, { templates, data });
          await page.addScriptTag({ content: `(function(){const module={exports:{}};const wx={getSystemInfoSync:()=>({pixelRatio:2}),getWindowInfo:()=>({pixelRatio:2})};${nativeChart};window.NativeWeather=module.exports;})();` });
          const canvasEvidence = await page.evaluate(({ hourly, dark, fontScale }) => {
            const canvas = document.querySelector("#weatherChart");
            if (!canvas) return { present: false };
            const box = canvas.getBoundingClientRect();
            window.NativeWeather.drawWeatherChart(canvas, box.width, box.height, hourly, { dark, fontScale });
            const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
            let painted = 0;
            for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) painted++;
            return { present: true, width: box.width, height: box.height, paintedPixels: painted };
          }, { hourly: data.weather.hourly, dark, fontScale: scale });
          const facts = await page.evaluate(() => {
            const rect = node => { const r = node.getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height }; };
            const rows = [...document.querySelectorAll(".role-row")].map(node => ({ ...rect(node), copy: rect(node.querySelector(".role-copy")), action: rect(node.querySelector(".role-action")) }));
            const overflow = [...document.querySelectorAll(".role-title,.role-sub,.role-action,.weather-place,.weather-summary,.weather-range,.weather-meta,.weather-advice")].filter(node => node.getBoundingClientRect().width > 0).filter(node => node.getBoundingClientRect().right > innerWidth + 1 || node.getBoundingClientRect().x < -1 || node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1).map(node => ({ class:node.className,text:node.textContent,box:rect(node),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth }));
            return { viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,rows,overflow,weatherCard:rect(document.querySelector(".trip-weather-card")),alerts:[...document.querySelectorAll(".weather-advice")].map(el=>el.textContent),bodyText:document.body.textContent };
          });
          assert.equal(facts.rows.length, 3, `${id}: actual role rows`);
          assert.ok(facts.documentWidth <= width + 1, `${id}: page overflow`);
          assert.deepEqual(facts.overflow, [], `${id}: clipped content`);
          for (const row of facts.rows) {
            assert.ok(row.copy.right <= row.action.x + 1, `${id}: role copy/action overlap`);
            assert.ok(row.action.right <= row.right + 1, `${id}: action overflow`);
          }
          const expectedOpen = state === "filled" ? 0 : state === "mixed" ? 1 : 3;
          assert.equal(bindings.filter(item => item.handler === "applyLeader" || item.handler === "applyPhotographer").length, expectedOpen, `${id}: open slot bindings`);
          assert.equal(bindings.filter(item => item.handler === "openLeader").length, 3 - expectedOpen, `${id}: filled slot bindings`);
          assert.equal(canvasEvidence.present, state !== "no-hourly", `${id}: no-hourly canvas conditional`);
          if (canvasEvidence.present) assert.ok(canvasEvidence.paintedPixels > 100, `${id}: chart rendered`);
          if ((width === 390 && scale === 1 && lang === "zh" && ["empty", "filled"].includes(state)) || (width === 320 && scale === 1.36 && lang === "en" && state === "mixed")) {
            const file = path.join(output, id + ".png");
            await page.screenshot({ path:file, fullPage:true });
            report.screenshots.push(file);
          }
          report.cases.push({ id,status:"pass",bindings,canvas:canvasEvidence,layout:{viewport:facts.viewport,documentWidth:facts.documentWidth,rows:facts.rows.length} });
        } catch (error) {
          const file = path.join(output, id + "-failed.png");
          await page.screenshot({ path:file, fullPage:true });
          report.cases.push({ id,status:"fail",error:error.message,screenshot:file });
        } finally { await page.close(); }
      }
    }
  } finally {
    await browser.close();
    report.summary = { total:report.cases.length,passed:report.cases.filter(item=>item.status==="pass").length,failed:report.cases.filter(item=>item.status==="fail").length,screenshots:report.screenshots.length };
    fs.writeFileSync(path.join(output,"report.json"),JSON.stringify(report,null,2)+"\n");
    console.log(JSON.stringify({ output,...report.summary }));
    for (const item of report.cases.filter(item=>item.status==="fail").slice(0,8)) console.error(item.id,item.error);
    if (report.summary.failed) process.exitCode = 1;
  }
}

main().catch(error => { console.error(error);process.exitCode=1; });
