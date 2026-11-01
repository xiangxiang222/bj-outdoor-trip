#!/usr/bin/env node
// Generated review copies; server/src/services/legal.js remains authoritative.
const fs = require("node:fs");
const path = require("node:path");
const { legalBundle } = require("../server/src/services/legal");

const bundle = legalBundle();
const output = path.join(__dirname, "..", "docs", "legal");
fs.mkdirSync(output, { recursive: true });
const esc = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", "<br>");
const metadata = `> 从 server/src/services/legal.js 生成；请勿直接修改。版本 ${bundle.version}，更新日期 ${bundle.updatedAt}，${bundle.status === "published" ? `生效日期 ${bundle.effectiveAt}` : "审阅版，尚未正式生效"}。\n`;
for (const document of bundle.documents) {
  const lines = [`# ${document.title}`, "", metadata, document.summary, ""];
  for (const section of document.sections) {
    lines.push(`## ${section.title}`, "", ...section.paragraphs.flatMap((paragraph) => [paragraph, ""]));
    for (const entry of section.entries) {
      lines.push(`### ${entry.title}`, "", "| 项目 | 说明 |", "| --- | --- |", ...entry.fields.map((field) => `| ${esc(field.label)} | ${esc(field.value)} |`), "");
    }
    lines.push(...section.links.flatMap((link) => [`[${link.label}](${link.url})`, ""]));
  }
  fs.writeFileSync(path.join(output, `${document.id}.md`), lines.join("\n") + "\n");
}
fs.writeFileSync(path.join(output, "README.md"), [
  "# 同行者众协议审阅文件", "", metadata,
  "以下文件与两端页面使用同一文本源。修改权威文本后运行 `npm run legal:export` 重新生成。正式发布条件、尚需补充的信息及实现限制见 [发布说明](../LEGAL_RELEASE.md)。", "",
  ...bundle.documents.map((document) => `- [${document.title}](./${document.id}.md)：${document.summary}`), "",
].join("\n"));
// Viewer-only copy for clients talking to a server predating /legal. Never
// embed production LEGAL_* values or generate published prose into this copy.
const review = {
  ...legalBundle({}),
  reviewOnly: true,
  notice: "当前展示内置审阅版，尚未正式生效。运营信息及处理规则仍待完善，正式版本以最新公示为准。",
};
const reviewJson = JSON.stringify(review, null, 2) + "\n";
for (const clientPath of ["miniprogram/content/legal-review.json", "web/src/data/legal-review.json"]) {
  const file = path.join(__dirname, "..", clientPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, reviewJson);
}
console.log(`已导出 ${bundle.documents.length} 份${bundle.status === "published" ? "正式" : "审阅版"}协议至 docs/legal`);
