import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const mini = path.join(root, "miniprogram");

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith(".wxml")) acc.push(p);
  }
  return acc;
}

function jsString(s) {
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function transformText(text) {
  const parts = text.split(/(\{\{[\s\S]*?\}\})/g);
  return parts
    .map((part) => {
      if (!part) return part;
      if (part.startsWith("{{")) {
        const expr = part.slice(2, -2).trim();
        if (!expr || expr.startsWith("tr.t(")) return part;
        return `{{tr.t(${expr}, lang)}}`;
      }
      const m = part.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (!m || !/[\u4e00-\u9fff]/.test(m[2])) return part;
      return `${m[1]}{{tr.t(${jsString(m[2])}, lang)}}${m[3]}`;
    })
    .join("");
}

function transformAttrs(tag) {
  return tag.replace(/\b(placeholder|title|aria-label|alt)="([^"]*)"/g, (full, name, val) => {
    if (val.includes("tr.t(")) return full;
    if (!/[\u4e00-\u9fff]/.test(val) && !val.includes("{{")) return full;
    if (val.startsWith("{{") && val.endsWith("}}") && val.indexOf("{{", 2) === -1) {
      const expr = val.slice(2, -2).trim();
      if (expr.startsWith("tr.t(")) return full;
      return `${name}="{{tr.t(${expr}, lang)}}"`;
    }
    return `${name}="${transformText(val)}"`;
  });
}

function tagEnd(src, i) {
  let quote = "";
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">") return j + 1;
  }
  return src.length;
}

function isKeep(tag) {
  return /\bdata-keep\b/.test(tag) || /class="[^"]*\bico\b/.test(tag);
}

function transform(src, relWxs) {
  let out = "";
  let i = 0;
  const stack = [];
  while (i < src.length) {
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i);
      const stop = end === -1 ? src.length : end + 3;
      out += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (src[i] === "<") {
      const end = tagEnd(src, i);
      let tag = src.slice(i, end);
      const closing = /^<\//.test(tag);
      const self = /\/>\s*$/.test(tag) || /^<(wxs|import|include)\b/.test(tag);
      if (closing) stack.pop();
      else if (!self) stack.push(isKeep(tag) || stack[stack.length - 1] === true);
      if (!closing) tag = transformAttrs(tag);
      out += tag;
      i = end;
      continue;
    }
    const next = src.indexOf("<", i);
    const text = src.slice(i, next === -1 ? src.length : next);
    out += stack[stack.length - 1] ? text : transformText(text);
    i = next === -1 ? src.length : next;
  }
  if (!out.includes("locale.wxs") && out.includes("tr.t(")) {
    const line = `<wxs src="${relWxs}" module="tr" />`;
    if (out.startsWith("<page-meta")) {
      const end = out.indexOf(">") + 1;
      out = out.slice(0, end) + "\n" + line + out.slice(end);
    } else out = line + "\n" + out;
  }
  return out;
}

let changed = 0;
for (const file of walk(mini)) {
  const wxs = file.includes(`${path.sep}pkg-detail${path.sep}`)
    ? path.join(mini, "pkg-detail/utils/locale.wxs")
    : path.join(mini, "utils/locale.wxs");
  let rel = path.relative(path.dirname(file), wxs).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  const src = fs.readFileSync(file, "utf8");
  const next = transform(src, rel);
  if (next !== src) {
    fs.writeFileSync(file, next);
    changed++;
  }
}
console.log("wxml", changed);
