const { request } = require("./request");
const lite = require("../data/routes-lite");
const { withLocalMediaList } = require("./media");

function asList(rows) {
  return Array.isArray(rows) && rows.length ? rows : [];
}

function filterLocal({ q, days, tag }) {
  return withLocalMediaList(asList(lite)).filter((r) => {
    if (days === "multi" && r.days < 4) return false;
    if (days && days !== "multi" && r.days !== days) return false;
    if (tag && r.category !== tag && !(r.tags || []).includes(tag)) return false;
    if (q && !(r.title + r.region + r.subtitle).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
}

async function loadRouteCatalog({ q = "", days = 0, tag = "" } = {}) {
  const local = filterLocal({ q, days, tag });
  const params = [];
  if (q) params.push("q=" + encodeURIComponent(q));
  if (days) params.push("days=" + days);
  if (tag) params.push("tag=" + encodeURIComponent(tag));
  try {
    const res = await request("/routes" + (params.length ? "?" + params.join("&") : ""));
    const rows = withLocalMediaList(asList(res.data));
    return { list: rows.length ? rows : local, err: "" };
  } catch (err) {
    return {
      list: local,
      err: local.length ? "" : (err && err.message) || "加载失败",
    };
  }
}

module.exports = { loadRouteCatalog };
