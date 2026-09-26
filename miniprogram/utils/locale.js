const data = require("./locale-data");

const charMap = Object.create(null);
for (let i = 0; i < data.chars.length; i += 2) charMap[data.chars[i]] = data.chars[i + 1];

const mixedKeys = Object.keys(data.en)
  .filter((key) => key.length >= 4 && /[^\u4e00-\u9fff]/.test(key))
  .sort((a, b) => b.length - a.length);

function embedKeys(s) {
  const en = data.en;
  let out = s;
  for (const key of mixedKeys) {
    if (out.includes(key)) out = out.split(key).join(en[key]);
  }
  return out;
}

function translate(text, lang) {
  if (text == null) return "";
  const s = String(text);
  if (!lang || lang === "zh") return s;
  if (!/[\u4e00-\u9fff]/.test(s)) return s;
  if (lang === "tw") return toTw(s);
  return toEn(s);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function wholeCount(s, en) {
  const core = s.trim();
  if (Object.prototype.hasOwnProperty.call(en, core)) return s.split(core).join(en[core]);
  let m = core.match(/^还缺\s*(\d+)\s*人$/);
  if (m) return s.replace(core, `${m[1]} seats left`);
  m = core.match(/^(\d+)\s*团$/);
  if (m) return s.replace(core, `${m[1]} trips`);
  m = core.match(/^(\d+)\s*人$/);
  if (m) return s.replace(core, `${m[1]} people`);
  m = core.match(/^(\d+)\s*日$/);
  if (m) return s.replace(core, `${m[1]}-day`);
  m = core.match(/^(\d+)\s*月$/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 12) return s.replace(core, MONTHS[n - 1]);
  }
  m = core.match(/^(\d+)\s*分钟前$/);
  if (m) return s.replace(core, `${m[1]} min ago`);
  m = core.match(/^(\d+)\s*小时前$/);
  if (m) return s.replace(core, `${m[1]} hr ago`);
  m = core.match(/^(\d+)\s*天前$/);
  if (m) return s.replace(core, `${m[1]} days ago`);
  return null;
}

function phrasePatterns(s) {
  return s
    .replace(/还缺\s*(\d+)\s*人/g, "$1 seats left")
    .replace(/余\s*(\d+)\s*座/g, "$1 seats left")
    .replace(/余\s*(\d+)\s*人/g, "$1 people left")
    .replace(/(\d+)\s*人已上车/g, "$1 aboard")
    .replace(/(\d+)\s*人已报名/g, "$1 signed up");
}

function toEn(s) {
  const en = data.en;
  const counted = wholeCount(s, en);
  if (counted != null) return counted;
  const patterned = phrasePatterns(embedKeys(s));
  return patterned.replace(/[\u4e00-\u9fff]+/g, (run, offset, whole) => {
    if (!Object.prototype.hasOwnProperty.call(en, run)) return run;
    if (run.length === 1 && (patterned.match(/[\u4e00-\u9fff]/g) || []).length > 1) return run;
    const prev = offset > 0 ? whole.charAt(offset - 1) : "";
    const word = en[run];
    if (/[0-9]/.test(prev) && word.charAt(0) !== " " && !/^[-·/]/.test(word)) return " " + word;
    return word;
  });
}

function toTw(s) {
  let out = s;
  for (const pair of data.phrases) {
    if (out.includes(pair[0])) out = out.split(pair[0]).join(pair[1]);
  }
  let next = "";
  for (const ch of out) next += charMap[ch] || ch;
  return next;
}

module.exports = { translate };
