const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");
const { zipStore, unzip } = require("./docx-zip");

const IMAGE_LIMIT = 5 * 1024 * 1024;
const STORY_IMAGE_MAX = 6;
const HIGHLIGHT_MAX = 6;

const HEADINGS = [
  "标题",
  "副标题",
  "天数",
  "类型",
  "地区",
  "难度",
  "季节",
  "里程",
  "成团人数",
  "标签",
  "封面",
  "相册",
  "视频",
  "亮点",
  "介绍",
  "图文",
  "行程",
  "阶梯价",
  "车型",
  "集合点",
  "费用含",
  "费用不含",
  "装备",
  "注意事项",
  "退款",
];
const HEADING_SET = new Set(HEADINGS);
const IMAGE_SECTIONS = new Set(["封面", "相册", "图文", "行程"]);
const BUSES = [
  { id: "coaster10", re: /考斯特|10\s*人|10座/ },
  { id: "van15", re: /商务|15\s*人|15座/ },
  { id: "bus38", re: /38\s*人|38座/ },
  { id: "bus50", re: /50\s*人|50座/ },
  { id: "bus30", re: /30\s*人|30座|中巴/ },
];
const STOP_RE = /^((?:次日\s*)?\d{1,2}:\d{2})\s*[｜|]\s*(.+)$/;

const TEMPLATE_SECTIONS = [
  ["标题", "线路名称，例如慕田峪长城一日游"],
  ["副标题", "一句话卖点，可空"],
  ["天数", "填 1日、2日、3日 或 多日"],
  ["类型", "长城、登山、山水、玩水、文化、草原、海滨，也可自拟"],
  ["地区", "例如 北京市 / 怀柔区"],
  ["难度", "休闲或进阶，可空"],
  ["季节", "例如 4-10月"],
  ["里程", "公里数，只写数字，可空"],
  ["成团人数", "数字，例如 10"],
  ["标签", "用顿号分隔，例如 长城、一日、纯玩"],
  ["封面", "在下面贴 1 张实拍。单张不超过 5MB，不要写价格、日期或集合点"],
  ["相册", "在下面贴图，张数不限，单张不超过 5MB"],
  ["视频", "一行一条链接，不把视频嵌进文档"],
  ["亮点", "每行一条，最多 6 条"],
  ["介绍", "给用户看的说明，可分段"],
  ["图文", "一段字后面贴一张图，图最多 6 张。图的下一行以「图说：」开头"],
  ["行程", "每一站先写「07:30｜这一站」，下一行写怎么走。配图贴在这一站说明后面，一站一张"],
  ["阶梯价", "每行「人数｜单价｜会员价」，例如 10｜299｜284。人越多越便宜。会员价可空"],
  ["车型", "用顿号分隔：10人考斯特、15人商务车、30人中巴、38人旅游大巴、50人大型大巴"],
  ["集合点", "每行「地点｜时间｜怎么找」，例如 东直门东方银座C口｜07:30｜地铁2号线C口"],
  ["费用含", "每行一条"],
  ["费用不含", "每行一条"],
  ["装备", "每行一条"],
  ["注意事项", "每行一条"],
];

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXml(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="webp" ContentType="image/webp"/>
  <Default Extension="gif" ContentType="image/gif"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function documentRelsXml(images) {
  const rows = images
    .map(
      (img, i) =>
        `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.name}"/>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rows}</Relationships>`;
}

function imagePixels(buf) {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16) || 1, height: buf.readUInt32BE(20) || 1 };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
        i += 2;
        continue;
      }
      const size = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buf.readUInt16BE(i + 7) || 1, height: buf.readUInt16BE(i + 5) || 1 };
      }
      if (!size) break;
      i += 2 + size;
    }
  }
  return { width: 800, height: 600 };
}

function imageExtent(buf) {
  const { width, height } = imagePixels(buf);
  const maxCx = 5400000;
  let cx = width * 9525;
  let cy = height * 9525;
  if (cx > maxCx) {
    cy = Math.max(1, Math.round((cy * maxCx) / cx));
    cx = maxCx;
  }
  return { cx: Math.max(1, cx), cy: Math.max(1, cy) };
}

function drawingXml(rid, buf, id) {
  const { cx, cy } = imageExtent(buf);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Picture ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function paragraphXml(block, image) {
  const runs = [];
  if (block.text) {
    const rPr = block.bold ? "<w:rPr><w:b/></w:rPr>" : "";
    runs.push(`<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(block.text)}</w:t></w:r>`);
  }
  if (image) runs.push(drawingXml(image.rid, image.data, image.id));
  return `<w:p>${runs.join("")}</w:p>`;
}

function documentXml(inner) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>${inner}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
}

function buildDocx(blocks, { method = 0 } = {}) {
  const images = [];
  const paras = [];
  for (const raw of blocks) {
    const block = typeof raw === "string" ? { text: raw } : raw;
    let image = null;
    if (block.image) {
      const data = Buffer.isBuffer(block.image) ? block.image : Buffer.from(block.image);
      const ext = block.ext || ".png";
      const same = images.find((img) => img.ext === ext && img.data.equals(data));
      if (same) {
        image = { rid: same.rid, data, id: same.id };
      } else {
        const id = images.length + 1;
        images.push({ name: `image${id}${ext}`, data, ext, rid: `rIdImg${id}`, id });
        image = { rid: `rIdImg${id}`, data, id };
      }
    }
    paras.push(paragraphXml(block, image));
  }
  const entries = [
    { name: "[Content_Types].xml", data: contentTypesXml() },
    { name: "_rels/.rels", data: rootRelsXml() },
    { name: "word/document.xml", data: documentXml(paras.join("")) },
    { name: "word/_rels/document.xml.rels", data: documentRelsXml(images) },
    ...images.map((img) => ({ name: `word/media/${img.name}`, data: img.data })),
  ];
  return zipStore(entries, { method });
}

function buildRouteTemplate() {
  const blocks = [
    {
      text: "按下面的标题填写。以「说明」开头的行只是提示，上传时会跳过。照片直接贴在对应标题下面。视频只写链接，一行一条。退款用全站规则，不用写。",
    },
  ];
  for (const [title, hint] of TEMPLATE_SECTIONS) {
    blocks.push({ text: title, bold: true });
    blocks.push({ text: `说明：${hint}` });
  }
  return buildDocx(blocks);
}

function isHint(text) {
  return /^说明[:：]/.test(String(text || "").trim());
}

function splitHeading(text) {
  const t = String(text || "")
    .replace(/^\uFEFF/, "")
    .trim();
  if (HEADING_SET.has(t)) return { heading: t, rest: "" };
  const m = t.match(
    /^(标题|副标题|天数|类型|地区|难度|季节|里程|成团人数|标签|封面|相册|视频|亮点|介绍|图文|行程|阶梯价|车型|集合点|费用含|费用不含|装备|注意事项|退款)\s*[:：]\s*(.*)$/
  );
  if (!m) return null;
  return { heading: m[1], rest: m[2].trim() };
}

function paragraphsOf(xml) {
  const parts = String(xml).split(/<w:p[\s>]/);
  const blocks = [];
  for (const part of parts.slice(1)) {
    const chunk = part.split("</w:p>")[0].replace(/<w:tab\b[^>]*\/>/g, " ").replace(/<w:br\b[^>]*\/>/g, "\n");
    const texts = [];
    const textRe = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = textRe.exec(chunk))) texts.push(decodeXml(m[1]));
    const images = [];
    const blipRe = /<(?:\w+:)?blip\b[^>]*(?:\w+:)?embed="([^"]+)"/g;
    while ((m = blipRe.exec(chunk))) images.push(m[1]);
    if (!images.length) {
      const dataRe = /<(?:\w+:)?imagedata\b[^>]*(?:\w+:)?id="([^"]+)"/g;
      while ((m = dataRe.exec(chunk))) images.push(m[1]);
    }
    blocks.push({ text: texts.join("").trim(), images: [...new Set(images)] });
  }
  return blocks;
}

function parseRels(xml) {
  const map = {};
  const re = /<Relationship\b([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const id = /(?:\s|^)Id="([^"]+)"/.exec(m[1]);
    const target = /(?:\s|^)Target="([^"]+)"/.exec(m[1]);
    if (id && target) map[id[1]] = decodeXml(target[1]);
  }
  return map;
}

function mediaKey(target) {
  let t = decodeURIComponent(String(target || "")).replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = [];
  for (const part of t.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  t = parts.join("/");
  if (!t.startsWith("word/")) t = `word/${t}`;
  return t;
}

function extOf(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ".jpg";
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return ".png";
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return ".gif";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return ".webp";
  return "";
}

function fileOf(files, name) {
  if (files[name]) return files[name];
  const hit = Object.keys(files).find((key) => key.replace(/^\/+/, "") === name);
  return hit ? files[hit] : null;
}

function oneLine(lines) {
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function linesOf(blocks) {
  const lines = [];
  for (const block of blocks || []) {
    for (const line of String(block.text || "").split("\n")) {
      const text = line.trim();
      if (!text || isHint(text)) continue;
      lines.push(text);
    }
  }
  return lines;
}

function proseOf(blocks) {
  return (blocks || [])
    .map((block) => String(block.text || "").trim())
    .filter((text) => text && !isHint(text))
    .join("\n\n");
}

function splitList(lines) {
  return lines
    .flatMap((line) => line.split(/[、,，]/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDays(text, warn) {
  if (!text) return null;
  const s = text.replace(/\s/g, "");
  if (/^(?:1日?|一日)$/.test(s)) return 1;
  if (/^(?:2日?|两日|二日)$/.test(s)) return 2;
  if (/^(?:3日?|三日)$/.test(s)) return 3;
  if (/^(?:多日|5日?)$/.test(s)) return 5;
  warn("天数请填 1日、2日、3日 或 多日");
  return null;
}

function parseNumber(text, warn, label) {
  if (!text) return null;
  const m = String(text).match(/\d+(?:\.\d+)?/);
  if (!m) {
    warn(`${label}请写数字`);
    return null;
  }
  return Number(m[0]);
}

function parseRouteTemplate(buffer, { destDir } = {}) {
  if (!destDir) throw new Error("缺少图片保存目录");
  const files = unzip(buffer);
  const doc = fileOf(files, "word/document.xml");
  if (!doc) throw new Error("不是有效的 Word 模板");
  const rels = parseRels(fileOf(files, "word/_rels/document.xml.rels"));
  const warnings = [];
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  let imageNo = 0;
  const resolveImage = (id) => {
    imageNo += 1;
    const n = imageNo;
    const target = rels[id];
    const buf = target ? fileOf(files, mediaKey(target)) : null;
    if (!buf) {
      warn(`第 ${n} 张图片在文档里找不到，已跳过`);
      return "";
    }
    if (buf.length > IMAGE_LIMIT) {
      warn(`第 ${n} 张图片超过 5MB，已跳过`);
      return "";
    }
    const ext = extOf(buf);
    if (!ext) {
      warn(`第 ${n} 张图片不是 jpg / png / webp / gif，已跳过`);
      return "";
    }
    const name = `${Date.now()}-${nanoid(8)}${ext}`;
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, name), buf);
    return `/static/uploads/${name}`;
  };

  const buckets = new Map();
  let section = "";
  const push = (name, block) => {
    if (!name || name === "退款") return;
    if (!buckets.has(name)) buckets.set(name, []);
    const text = String(block.text || "").trim();
    const images = block.images || [];
    if (!text && !images.length) return;
    if (text && isHint(text) && !images.length) return;
    if (!IMAGE_SECTIONS.has(name) && images.length) {
      warn(`「${name}」下面的图片没有导入，请贴到封面、相册、图文或行程`);
      if (text && !isHint(text)) buckets.get(name).push({ text, images: [] });
      return;
    }
    buckets.get(name).push({ text: text && isHint(text) ? "" : text, images });
  };

  for (const block of paragraphsOf(doc.toString("utf8"))) {
    const hit = splitHeading(block.text);
    if (hit) {
      section = hit.heading;
      if (hit.heading === "退款") {
        warn("退款仍用全站规则，模板里的退款没有导入");
        continue;
      }
      if (hit.rest) push(section, { text: hit.rest, images: [] });
      if (block.images.length) push(section, { text: "", images: block.images });
      continue;
    }
    if (!section) {
      if (block.images.length) warn("请把照片贴在封面、相册、图文或行程标题下面");
      continue;
    }
    if (section === "退款") continue;
    push(section, block);
  }

  const take = (name) => buckets.get(name) || [];
  const title = oneLine(linesOf(take("标题")));
  const daysText = oneLine(linesOf(take("天数")));
  const kmText = oneLine(linesOf(take("里程")));
  const groupText = oneLine(linesOf(take("成团人数")));

  let cover = "";
  let coverExtra = false;
  for (const block of take("封面")) {
    for (const id of block.images) {
      if (cover) {
        coverExtra = true;
        continue;
      }
      const url = resolveImage(id);
      if (url) cover = url;
    }
  }
  if (coverExtra) warn("封面只导入第 1 张");

  const gallery = [];
  for (const block of take("相册")) {
    for (const id of block.images) {
      const url = resolveImage(id);
      if (url) gallery.push(url);
    }
  }

  const story = [];
  let storyImages = 0;
  let storyExtra = false;
  const pushStoryImage = (id, caption) => {
    if (storyImages >= STORY_IMAGE_MAX) {
      storyExtra = true;
      return;
    }
    const url = resolveImage(id);
    if (!url) return;
    storyImages += 1;
    story.push({ type: "image", url, caption: caption || "" });
  };
  for (const block of take("图文")) {
    const text = String(block.text || "").trim();
    const caption = /^图说[:：]/.test(text) ? text.replace(/^图说[:：]\s*/, "").trim() : "";
    if (caption && block.images.length) {
      pushStoryImage(block.images[0], caption);
      for (const id of block.images.slice(1)) pushStoryImage(id, "");
      continue;
    }
    if (caption && story.length && story.at(-1).type === "image" && !story.at(-1).caption) {
      story.at(-1).caption = caption;
      for (const id of block.images) pushStoryImage(id, "");
      continue;
    }
    if (text) story.push({ type: "text", body: text });
    for (const id of block.images) pushStoryImage(id, "");
  }
  if (storyExtra) warn("图文只导入前 6 张");

  const itinerary = [];
  let extraStopPhoto = false;
  const attachStopPhoto = (id) => {
    const stop = itinerary.at(-1);
    if (!stop) {
      warn("行程配图请贴在某一站的说明后面");
      return;
    }
    if (stop.photo) {
      extraStopPhoto = true;
      return;
    }
    const url = resolveImage(id);
    if (url) stop.photo = url;
  };
  for (const block of take("行程")) {
    for (const line of String(block.text || "").split("\n")) {
      const text = line.trim();
      if (!text || isHint(text)) continue;
      const matched = text.match(STOP_RE);
      if (matched) {
        itinerary.push({
          time: matched[1].replace(/\s+/g, " ").trim(),
          title: matched[2].trim(),
          detail: "",
          photo: "",
        });
        continue;
      }
      const stop = itinerary.at(-1);
      if (!stop) {
        warn("行程请先写「07:30｜这一站」");
        continue;
      }
      stop.detail = stop.detail ? `${stop.detail}\n${text}` : text;
    }
    for (const id of block.images) attachStopPhoto(id);
  }
  if (extraStopPhoto) warn("每一站只导入 1 张配图");

  const highlightLines = linesOf(take("亮点")).map((line) => line.replace(/^(?:[-•·]|\d+[.、])\s*/, "").trim()).filter(Boolean);
  if (highlightLines.length > HIGHLIGHT_MAX) warn("亮点只导入前 6 条");

  const videos = [];
  for (const line of linesOf(take("视频"))) {
    const found = line.match(/https?:\/\/\S+/g);
    if (!found) {
      warn("有一条视频不是链接，已跳过");
      continue;
    }
    videos.push(...found.map((url) => url.replace(/[，。,]+$/, "")));
  }

  const priceTiers = [];
  for (const line of linesOf(take("阶梯价"))) {
    const parts = line.split(/[｜|]/).map((item) => item.trim()).filter(Boolean);
    const minPeople = Number(String(parts[0] || "").replace(/[^\d]/g, ""));
    const price = Number(String(parts[1] || "").replace(/[^\d.]/g, ""));
    const memberPrice = parts[2] ? Number(String(parts[2]).replace(/[^\d.]/g, "")) : null;
    if (parts.length < 2 || !minPeople || !Number.isFinite(price)) {
      warn(`阶梯价无法识别：${line}`);
      continue;
    }
    priceTiers.push({
      minPeople,
      price,
      memberPrice: memberPrice != null && Number.isFinite(memberPrice) ? memberPrice : null,
    });
  }

  const buses = [];
  for (const piece of splitList(linesOf(take("车型")))) {
    const hit = BUSES.find((bus) => bus.re.test(piece));
    if (!hit) {
      warn(`未识别的车型：${piece}`);
      continue;
    }
    if (!buses.includes(hit.id)) buses.push(hit.id);
  }

  const meetupPoints = linesOf(take("集合点"))
    .map((line) => {
      const parts = line.split(/[｜|]/).map((item) => item.trim());
      const name = parts[0] || "";
      if (!name) return null;
      return { id: name, name, timeHint: parts[1] || "", geo: parts.slice(2).join("｜") };
    })
    .filter(Boolean);

  return {
    title,
    subtitle: oneLine(linesOf(take("副标题"))),
    days: parseDays(daysText, warn),
    category: oneLine(linesOf(take("类型"))),
    region: oneLine(linesOf(take("地区"))),
    difficulty: oneLine(linesOf(take("难度"))),
    season: oneLine(linesOf(take("季节"))),
    distanceKm: parseNumber(kmText, warn, "里程"),
    minGroupSize: parseNumber(groupText, warn, "成团人数"),
    tags: splitList(linesOf(take("标签"))),
    cover,
    gallery,
    videos,
    highlights: highlightLines.slice(0, HIGHLIGHT_MAX),
    description: proseOf(take("介绍")),
    story,
    itinerary,
    priceTiers,
    buses,
    meetupPoints,
    feeInclude: proseOf(take("费用含")),
    feeExclude: proseOf(take("费用不含")),
    equipment: proseOf(take("装备")),
    notices: proseOf(take("注意事项")),
    warnings,
  };
}

module.exports = {
  buildRouteTemplate,
  buildDocx,
  parseRouteTemplate,
};
