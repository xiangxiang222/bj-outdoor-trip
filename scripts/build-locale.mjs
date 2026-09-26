import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const en = JSON.parse(fs.readFileSync(path.join(root, "web/src/utils/locale-en.json"), "utf8"));
const tw = JSON.parse(fs.readFileSync(path.join(root, "web/src/utils/locale-tw.json"), "utf8"));
const data = { chars: tw.chars, phrases: tw.phrases, en };

const cjs = "module.exports = " + JSON.stringify(data) + ";\n";
fs.writeFileSync(path.join(root, "miniprogram/utils/locale-data.js"), cjs);

const wxs = `var RAW = ${JSON.stringify(tw.chars)};
var CH = {};
var i;
for (i = 0; i < RAW.length; i += 2) CH[RAW.charAt(i)] = RAW.charAt(i + 1);
var PHRASES = ${JSON.stringify(tw.phrases)};
var EN = ${JSON.stringify(en)};
var MIXED = ${JSON.stringify(Object.keys(en).filter((key) => key.length >= 4 && /[^\u4e00-\u9fff]/.test(key)).sort((a, b) => b.length - a.length))};

function trim(s) {
  var a = 0;
  var b = s.length;
  while (a < b) {
    var c = s.charAt(a);
    if (c !== " " && c !== "\\n" && c !== "\\t") break;
    a++;
  }
  while (b > a) {
    var d = s.charAt(b - 1);
    if (d !== " " && d !== "\\n" && d !== "\\t") break;
    b--;
  }
  return s.substring(a, b);
}

function digits(s) {
  if (!s) return false;
  var i;
  for (i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c < "0" || c > "9") return false;
  }
  return true;
}

function toTw(s) {
  var i;
  for (i = 0; i < PHRASES.length; i++) {
    if (s.indexOf(PHRASES[i][0]) >= 0) s = s.split(PHRASES[i][0]).join(PHRASES[i][1]);
  }
  var out = "";
  for (i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    out += CH[ch] || ch;
  }
  return out;
}

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function compact(s) {
  return s.split(" ").join("");
}

function swapCore(s, core, next) {
  var at = s.indexOf(core);
  if (at < 0) return next;
  return s.substring(0, at) + next + s.substring(at + core.length);
}

function wholeCount(s) {
  var core = trim(s);
  if (EN[core]) return swapCore(s, core, EN[core]);
  var packed = compact(core);
  if (packed.indexOf("还缺") === 0 && packed.charAt(packed.length - 1) === "人") {
    var mid = packed.substring(2, packed.length - 1);
    if (digits(mid)) return swapCore(s, core, mid + " seats left");
  }
  var last = packed.charAt(packed.length - 1);
  var head = packed.substring(0, packed.length - 1);
  if (digits(head)) {
    if (last === "团") return swapCore(s, core, head + " trips");
    if (last === "人") return swapCore(s, core, head + " people");
    if (last === "日") return swapCore(s, core, head + "-day");
    if (last === "月") {
      var n = parseInt(head, 10);
      if (n >= 1 && n <= 12) return swapCore(s, core, MONTHS[n - 1]);
    }
  }
  var ago = endsNum(packed, "分钟前");
  if (ago) return swapCore(s, core, ago + " min ago");
  ago = endsNum(packed, "小时前");
  if (ago) return swapCore(s, core, ago + " hr ago");
  ago = endsNum(packed, "天前");
  if (ago) return swapCore(s, core, ago + " days ago");
  return "";
}

function endsNum(packed, suffix) {
  if (packed.length <= suffix.length) return "";
  if (packed.substring(packed.length - suffix.length) !== suffix) return "";
  var head = packed.substring(0, packed.length - suffix.length);
  if (!digits(head)) return "";
  return head;
}

function phrasePatterns(s) {
  var rules = [
    ["还缺\\\\s*(\\\\d+)\\\\s*人", "$1 seats left"],
    ["余\\\\s*(\\\\d+)\\\\s*座", "$1 seats left"],
    ["余\\\\s*(\\\\d+)\\\\s*人", "$1 people left"],
    ["(\\\\d+)\\\\s*人已上车", "$1 aboard"],
    ["(\\\\d+)\\\\s*人已报名", "$1 signed up"]
  ];
  var i;
  for (i = 0; i < rules.length; i++) s = s.replace(getRegExp(rules[i][0], "g"), rules[i][1]);
  return s;
}

function embedKeys(s) {
  var i;
  for (i = 0; i < MIXED.length; i++) {
    if (s.indexOf(MIXED[i]) >= 0) s = s.split(MIXED[i]).join(EN[MIXED[i]]);
  }
  return s;
}

function toEn(s) {
  var counted = wholeCount(s);
  if (counted) return counted;
  s = phrasePatterns(embedKeys(s));
  var hanCount = 0;
  var j;
  for (j = 0; j < s.length; j++) {
    var cj = s.charCodeAt(j);
    if (cj >= 0x4e00 && cj <= 0x9fff) hanCount++;
  }
  var out = "";
  var i = 0;
  while (i < s.length) {
    var code = s.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff) {
      var start = i;
      var run = "";
      while (i < s.length) {
        var code2 = s.charCodeAt(i);
        if (code2 < 0x4e00 || code2 > 0x9fff) break;
        run += s.charAt(i);
        i++;
      }
      if (!EN[run] || (run.length === 1 && hanCount > 1)) {
        out += run;
      } else {
        var prev = start > 0 ? s.charAt(start - 1) : "";
        var word = EN[run];
        if (prev >= "0" && prev <= "9" && word.charAt(0) !== " " && word.charAt(0) !== "-" && word.charAt(0) !== "/" && word.charAt(0) !== "·") out += " ";
        out += word;
      }
    } else {
      out += s.charAt(i);
      i++;
    }
  }
  return out;
}

function t(text, lang) {
  if (text === undefined || text === null || text === "") return "";
  var s = text + "";
  if (!lang || lang === "zh") return s;
  var has = false;
  var i;
  for (i = 0; i < s.length; i++) {
    var code = s.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff) has = true;
  }
  if (!has) return s;
  if (lang === "tw") return toTw(s);
  return toEn(s);
}

module.exports = { t: t };
`;

const targets = [
  path.join(root, "miniprogram/utils/locale.wxs"),
  path.join(root, "miniprogram/pkg-detail/utils/locale.wxs"),
];
for (const file of targets) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, wxs);
}
console.log("locale data", Buffer.byteLength(cjs), "wxs", Buffer.byteLength(wxs));
