import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const rootArg = args.indexOf("--root");
const root = rootArg < 0 ? join(repo, "miniprogram") : resolve(args[rootArg + 1] || "miniprogram");
const json = args.includes("--json");
const limit = 2 * 1024 * 1024;
const project = JSON.parse(readFileSync(join(root, "project.config.json"), "utf8"));
const app = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
const portable = (value) => value.split(sep).join("/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
const ignoredByTool = new Set(["project.config.json", "project.private.config.json", ".DS_Store"]);

function globRegex(pattern) {
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

function matches(file, rule) {
  const value = portable(String(rule.value || ""));
  if (!value) return false;
  if (rule.type === "folder") return file === value || file.startsWith(value + "/");
  if (rule.type === "file") return file === value;
  if (rule.type === "suffix") return file.endsWith(value);
  if (rule.type === "prefix") return file.startsWith(value);
  if (rule.type === "glob") return globRegex(value).test(file);
  if (rule.type === "regexp" || rule.type === "regex") return new RegExp(rule.value).test(file);
  throw new Error(`Unsupported packOptions rule type: ${rule.type}`);
}

const ignored = project.packOptions?.ignore || [];
const included = project.packOptions?.include || [];
function isPacked(file) {
  if (file.split("/").some((part) => part.startsWith(".")) || ignoredByTool.has(file)) return false;
  return included.some((rule) => matches(file, rule)) || !ignored.some((rule) => matches(file, rule));
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not supported in the mini-program package: ${full}`);
    return entry.isDirectory() ? walk(full) : [portable(relative(root, full))];
  });
}

const all = walk(root);
const files = all.filter(isPacked);
const packed = new Set(files);
const subpackages = (app.subPackages || app.subpackages || []).map((item) => ({
  name: item.name || item.root,
  root: portable(item.root),
  bytes: 0,
  files: 0,
})).sort((a, b) => b.root.length - a.root.length);
const main = { name: "main", root: "", bytes: 0, files: 0 };
for (const file of files) {
  const target = subpackages.find((pkg) => file.startsWith(pkg.root + "/")) || main;
  target.bytes += statSync(join(root, file)).size;
  target.files += 1;
}

const errors = [];
let resourceCount = 0;
const imageExt = /\.(?:png|jpe?g|webp|gif|svg|bmp|ico)$/i;
function checkResource(source, value) {
  if (!value || value.includes("{{") || /^(?:https?:|data:|wxfile:|cloud:|\/static\/)/i.test(value)) return;
  const clean = value.split(/[?#]/)[0];
  if (!imageExt.test(clean)) return;
  if (/^\.[A-Za-z0-9]+$/.test(clean)) return; // An extension concatenated onto a runtime URL.
  if (!clean.startsWith("/") && !clean.startsWith(".") && !clean.startsWith("images/")) return;
  if (extname(source) === ".js" && clean.startsWith("/") && !/^\/(?:images|assets|pkg[^/]*)\//.test(clean)) return;
  const target = clean.startsWith("/") || clean.startsWith("images/")
    ? resolve(root, clean.replace(/^\/+/, ""))
    : resolve(dirname(join(root, source)), clean);
  const local = portable(relative(root, target));
  resourceCount += 1;
  if (local.startsWith("../") || isAbsolute(relative(root, target)) || !existsSync(target)) {
    errors.push(`Missing local image: ${source} -> ${value}`);
  } else if (!packed.has(local)) errors.push(`Local image excluded from package: ${source} -> ${value}`);
}

for (const source of files) {
  if (![".js", ".json", ".wxml", ".wxss", ".wxs"].includes(extname(source))) continue;
  const text = readFileSync(join(root, source), "utf8");
  // Literal paths only. Dynamic WXML expressions and runtime URLs need runtime verification.
  for (const match of text.matchAll(/["'`]([^"'`\r\n]+)["'`]/g)) checkResource(source, match[1]);
  for (const match of text.matchAll(/url\(\s*([^\s'"()]+)\s*\)/g)) checkResource(source, match[1]);
}

const packages = [main, ...subpackages].map((pkg) => ({ ...pkg, kib: Number((pkg.bytes / 1024).toFixed(1)), limitBytes: limit, remainingBytes: limit - pkg.bytes }));
for (const pkg of packages) if (pkg.bytes > limit) errors.push(`${pkg.name}: ${pkg.kib} KiB exceeds the 2048 KiB source budget`);
const report = { basis: "Source bytes before WeChat compilation; confirm final size in Developer Tools.", packages, excludedFiles: all.length - files.length, checkedLocalImageReferences: resourceCount, errors: [...new Set(errors)] };
if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(report.basis);
  for (const pkg of packages) console.log(`${pkg.name}: ${pkg.kib} KiB / 2048 KiB (${pkg.files} files, ${Math.floor(pkg.remainingBytes / 1024)} KiB spare)`);
  console.log(`Checked ${resourceCount} literal local image references; excluded ${report.excludedFiles} files.`);
  report.errors.forEach((error) => console.error(error));
}
if (report.errors.length) process.exitCode = 1;
