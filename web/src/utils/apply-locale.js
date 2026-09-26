import { readLook } from "./appearance";
import { translate } from "./locale";

const originals = new WeakMap();
const attrOriginals = new WeakMap();
const ATTRS = ["placeholder", "title", "aria-label", "alt"];

function lang() {
  return readLook().lang;
}

function blocked(node) {
  const el = node.parentElement;
  if (!el) return true;
  return !!el.closest("script, style, textarea, noscript, [data-keep], .ico");
}

function applyText(node) {
  if (!node || node.nodeType !== 3 || blocked(node)) return;
  const current = node.nodeValue;
  if (!current) return;
  let original = originals.get(node);
  const expected = original === undefined ? null : translate(original, lang());
  if (original === undefined) {
    original = current;
    originals.set(node, original);
  } else if (current !== expected && current !== original) {
    original = current;
    originals.set(node, original);
  }
  const next = translate(originals.get(node), lang());
  if (next !== node.nodeValue) node.nodeValue = next;
}

function applyAttrs(el) {
  if (!el || el.nodeType !== 1) return;
  if (el.closest("script, style, textarea, [data-keep]")) return;
  let bag = attrOriginals.get(el);
  if (!bag) {
    bag = {};
    attrOriginals.set(el, bag);
  }
  for (const name of ATTRS) {
    if (!el.hasAttribute(name)) continue;
    const current = el.getAttribute(name);
    const expected = bag[name] === undefined ? null : translate(bag[name], lang());
    if (bag[name] === undefined) bag[name] = current;
    else if (current !== expected && current !== bag[name]) bag[name] = current;
    const next = translate(bag[name], lang());
    if (next !== current) el.setAttribute(name, next);
  }
}

function walk(node) {
  if (!node) return;
  if (node.nodeType === 3) {
    applyText(node);
    return;
  }
  if (node.nodeType !== 1) return;
  applyAttrs(node);
  if (node.closest && node.closest("script, style")) return;
  for (const child of node.childNodes) walk(child);
}

let started = false;
let titleOriginal;

function applyTitle() {
  const current = document.title || "";
  if (titleOriginal === undefined) titleOriginal = current;
  else {
    const expected = translate(titleOriginal, lang());
    if (current !== expected && current !== titleOriginal) titleOriginal = current;
  }
  const next = translate(titleOriginal, lang());
  if (next !== document.title) document.title = next;
}

export function startLocale() {
  if (started || typeof document === "undefined") return;
  started = true;
  const flush = () => {
    walk(document.body);
    applyTitle();
  };
  flush();
  const obs = new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type === "characterData") applyText(rec.target);
      else if (rec.type === "attributes") applyAttrs(rec.target);
      else rec.addedNodes.forEach((node) => walk(node));
    }
  });
  obs.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
  window.addEventListener("bj-look", flush);
  const alert0 = window.alert.bind(window);
  const confirm0 = window.confirm.bind(window);
  window.alert = (msg) => alert0(translate(String(msg ?? ""), lang()));
  window.confirm = (msg) => confirm0(translate(String(msg ?? ""), lang()));
}
