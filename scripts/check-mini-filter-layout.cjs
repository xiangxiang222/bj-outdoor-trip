#!/usr/bin/env node
// A browser compatibility simulation of the Mini Program's v2 button baseline.
// This is deliberately not a claim of a WeChat simulator or a real-device test.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const output = process.env.MINI_FILTER_ARTIFACT_DIR || "/tmp/bj-filter-layout";
const translations = JSON.parse(fs.readFileSync(path.join(root,"web/src/utils/locale-en.json"),"utf8"));
// Restore only the missing native-button overrides in memory to prove that the
// assertions detect the original failure. The source WXSS files stay untouched.
const reproduceLegacy = process.argv.includes("--reproduce-unset-width");
fs.mkdirSync(output, { recursive: true });
const escape = (value) => value.replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
function readStyle(file, width) {
  let css = fs.readFileSync(path.join(root, file), "utf8").replace(/@import\s+[^;]+;/g, "");
  if (reproduceLegacy) {
    const without = (declarations, properties) => declarations.split(";").filter((declaration) => !properties.includes(declaration.split(":")[0].trim())).join(";");
    css = css.replace(/(\.departure-time-bar \.departure-time-chip|\.rt-catalog button|\.rt-catalog \.rt-filter|\.rt-catalog \.rt-mode)\s*\{([^}]+)\}/g, (_, selector, declarations) => {
      const legacy = without(declarations, selector.endsWith(" .rt-mode") ? ["width", "flex"] : ["width"]);
      return `${selector} {${legacy}}`;
    }).replace(/(\.rt-modes)\s*\{([^}]+)\}/g, (_, selector, declarations) => `${selector} {${without(declarations, ["width", "max-width", "min-width", "flex"]).replace("display:flex", "display:inline-flex")}}`);
  }
  return css.replace(/(-?(?:\d+\.?\d*|\.\d+))rpx\b/g, (_, amount) => Number(amount) * width / 750 + "px");
}

function documentFor(width, scale, lang, longDate) {
  const en = lang === "en";
  const t = (text) => en ? translations[text] || text : text;
  const dates = ["不限日期", "本周末", "下周末"].map(t).concat(longDate ? (en ? "2026-12-31 – 2027-01-02" : "2026年12月31日—2027年1月2日") : t("选日期"));
  const days = ["全部天数", "1日", "2日", "3日", "多日"].map(t);
  const tags = ["全部玩法", "徒步", "登山", "玩水", "亲子", "摄影", "露营"].map(t);
  const modes = ["大图", "双列", "列表"].map(t);
  const chip = (label, className, index) => `<button class="${className}${index === 0 ? " on" : ""}"><span class="filter-copy">${escape(label)}</span></button>`;
  const calendar = `<button class="departure-time-chip departure-calendar-trigger"><view class="departure-calendar-icon" aria-hidden="true"></view><text class="filter-copy">${escape(dates[3])}</text><view class="departure-down" aria-hidden="true"></view></button>`;
  const nativeStyles = readStyle("miniprogram/styles/route-catalog.wxss", width) + readStyle("miniprogram/pages/index/index.wxss", width);
  return `<!doctype html><html lang="${lang}"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    html,body { margin:0; padding:0; width:100%; font-family:Arial,"PingFang SC",sans-serif; background:#f6f5f8; }
    view,scroll-view { display:block; } text { display:inline; }
    .page { --ui-scale:${scale}; width:100%; color:#24222a; font-size:${28 * width / 750}px; line-height:1.55; }
    /* style:v2 default button width is what plain HTML button tests miss. */
    button { box-sizing:border-box; width:184px; margin:0 auto; display:block; padding:0 14px; border:0; font:inherit; line-height:2.55; text-align:center; overflow:hidden; }
    scroll-view { overflow-x:auto; overflow-y:hidden; }
    .control-anchor { box-sizing:border-box; margin:15px ${28 * width / 750}px; padding:16px; background:white; border-radius:14px; }
    ${nativeStyles}
    </style><body><div class="page">
    <div class="control-anchor" id="before-anchor">${en ? "Matching departures" : "即将出发"}</div>
    <view class="departure-time-bar"><scroll-view class="departure-shortcut-scroll" data-scroll="dates"><view class="departure-shortcut-row">${dates.slice(0,3).map((text,index) => chip(text,"departure-time-chip",index)).join("")}${calendar}</view></scroll-view></view>
    <div class="control-anchor" id="city-anchor">${en ? "Huairou · Miyun · Changping" : "怀柔 · 密云 · 昌平"}</div>
    <view class="rt-catalog">
      <scroll-view class="rt-filter-scroll" data-scroll="days"><view class="rt-filter-row">${days.map((text,index) => chip(text,"rt-filter",index)).join("")}</view></scroll-view>
      <scroll-view class="rt-filter-scroll" data-scroll="tags"><view class="rt-filter-row">${tags.map((text,index) => chip(text,"rt-filter",index)).join("")}</view></scroll-view>
      <view class="rt-toolbar"><view class="rt-result"><text>12</text> ${en ? "routes" : "条线路"}</view><view class="rt-modes">${modes.map((text,index) => `<button class="rt-mode${index === 1 ? " on" : ""}"><view class="rt-mode-icon ${["poster","grid","list"][index]}"><view></view><view></view><view></view><view></view></view><text>${escape(text)}</text></button>`).join("")}</view></view>
      <div class="control-anchor" id="content-anchor">${en ? "Route details stay aligned" : "线路正文不随横向筛选移动"}</div>
    </view></div></body></html>`;
}

async function main() {
  const executablePath = process.env.CHROME_PATH || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : ["/usr/bin/chromium", "/usr/bin/google-chrome"].find(fs.existsSync));
  assert.ok(executablePath && fs.existsSync(executablePath), "Set CHROME_PATH to Chrome/Chromium");
  const browser = await chromium.launch({ executablePath, headless:true });
  const results = [];
  try {
    for (const width of [320,390,430]) for (const scale of [1,1.35]) for (const lang of ["zh","en"]) for (const longDate of [false,true]) {
      const id = `${width}-${scale}-${lang}-${longDate ? "long" : "short"}`;
      const page = await browser.newPage({ viewport:{ width,height:900 },deviceScaleFactor:1 });
      try {
        await page.setContent(documentFor(width,scale,lang,longDate));
        const facts = await page.evaluate(() => {
          const rect = (element) => { const r = element.getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height }; };
          const anchors = ["before-anchor","city-anchor","content-anchor"].map((id) => rect(document.getElementById(id)));
          const rows = [...document.querySelectorAll("[data-scroll]")].map((scroll) => {
            const first = scroll.querySelector("button"), copy = first.querySelector(".filter-copy"), style = getComputedStyle(first);
            const expected = copy.getBoundingClientRect().width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
            const buttons = [...scroll.querySelectorAll("button")].map((button) => ({ box:rect(button),copy:rect(button.querySelector(".filter-copy")) }));
            const initial = { outer:rect(scroll),first:rect(first),copy:rect(copy),expected,buttons,scrollWidth:scroll.scrollWidth,clientWidth:scroll.clientWidth };
            scroll.scrollLeft = scroll.scrollWidth;
            const scrolled = { left:scroll.scrollLeft,outer:rect(scroll),last:rect(scroll.querySelector("button:last-child")) };
            return { key:scroll.dataset.scroll,...initial,scrolled };
          });
          const after = ["before-anchor","city-anchor","content-anchor"].map((id) => rect(document.getElementById(id)));
          const modes = [...document.querySelectorAll(".rt-mode")].map((button) => {
            const icon = button.querySelector(".rt-mode-icon");
            return { ...rect(button),copy:rect(button.querySelector("text")),icon:rect(icon),iconParts:[...icon.children].filter((part) => getComputedStyle(part).display !== "none").map(rect) };
          });
          return { viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,pageX:window.scrollX,anchors,after,rows,modes,modeBox:rect(document.querySelector(".rt-modes")) };
        });
        const failures = [];
        if (facts.documentWidth > width + 1 || facts.bodyWidth > width + 1 || facts.pageX !== 0) failures.push(`whole-page horizontal overflow: document=${facts.documentWidth}, body=${facts.bodyWidth}`);
        for (const row of facts.rows) {
          if (row.first.x < row.outer.x - 1 || row.copy.x < row.outer.x - 1) failures.push(`${row.key}: first option begins outside its scroll viewport`);
          if (row.first.right > row.outer.right + 1) failures.push(`${row.key}: first option is not fully visible`);
          if (row.first.width > row.expected + 2) failures.push(`${row.key}: button width ${row.first.width.toFixed(1)} exceeds content width ${row.expected.toFixed(1)} (v2 default width inherited)`);
          if (row.buttons.some(({ box,copy }) => copy.x < box.x - 1 || copy.right > box.right + 1)) failures.push(`${row.key}: an option's text is clipped inside its button`);
          if (row.outer.right > width + 1 || row.outer.x < -1) failures.push(`${row.key}: scroll viewport exceeds screen bounds`);
          if (row.scrolled.outer.x !== row.outer.x) failures.push(`${row.key}: horizontal scrolling moved its outer container`);
          if (row.scrollWidth > row.clientWidth + 1 && row.scrolled.left <= 0) failures.push(`${row.key}: internal scrolling is unavailable`);
          if (row.scrolled.last.right > row.outer.right + 2) failures.push(`${row.key}: final option cannot be reached`);
        }
        if (facts.modes.some((box) => box.x < -1 || box.right > width + 1)) failures.push("a display-mode button is outside the viewport");
        if (facts.modeBox.right > width + 1) failures.push("display-mode group overflows the viewport");
        if (facts.modes.some((box) => box.copy.x < box.x - 1 || box.copy.right > box.right + 1 || box.copy.y < box.y - 1 || box.copy.bottom > box.bottom + 1)) failures.push("display-mode text is clipped by its button");
        if (facts.modes.some((box) => box.iconParts.some((part) => part.x < box.icon.x - 1 || part.right > box.icon.right + 1 || part.y < box.icon.y - 1 || part.bottom > box.icon.bottom + 1))) failures.push("display-mode icon parts exceed the icon bounds");
        if (facts.anchors.some((box,index) => box.x !== facts.after[index].x)) failures.push("scrolling a filter row shifted normal page content");
        results.push({ id,pass:failures.length === 0,failures,facts });
        // Evidence should show the initial, fully visible first option; the
        // scroll-to-end measurements above remain available in report.json.
        await page.evaluate(() => document.querySelectorAll("[data-scroll]").forEach((scroll) => { scroll.scrollLeft = 0; }));
        if (failures.length || (width === 390 && ((scale === 1 && lang === "zh" && !longDate) || (scale === 1.35 && lang === "en" && longDate)))) await page.screenshot({ path:path.join(output,`filters-${id}.png`),fullPage:true });
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output,"report.json"),JSON.stringify({ simulation:"Browser compatibility layout with WeChat style:v2 184px button baseline; not a native/device test",mode:reproduceLegacy ? "In-memory fault injection: missing width overrides and mode sizing" : "Actual repository WXSS",results },null,2));
  const failed = results.filter((row) => !row.pass);
  for (const row of failed) console.error(`FAIL ${row.id}: ${row.failures.join("; ")}`);
  console.log(`Mini filter compatibility layout${reproduceLegacy ? " (legacy fault injection)" : " (actual WXSS)"}: ${results.length - failed.length}/${results.length} cases passed. Artifacts: ${output}`);
  if (failed.length) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
