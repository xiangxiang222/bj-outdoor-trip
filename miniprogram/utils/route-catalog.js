const { request } = require("./request");
const { withLocalMediaList } = require("./media");

function asList(rows) {
  return Array.isArray(rows) ? rows : [];
}

async function loadRouteCatalog({ q = "", days = 0, tag = "" } = {}) {
  const params = [];
  if (q) params.push("q=" + encodeURIComponent(q));
  if (days) params.push("days=" + days);
  if (tag) params.push("tag=" + encodeURIComponent(tag));
  try {
    const res = await request("/routes" + (params.length ? "?" + params.join("&") : ""));
    return { list: withLocalMediaList(asList(res.data)), err: "" };
  } catch (err) {
    return { list: [], err: (err && err.message) || "加载失败" };
  }
}

module.exports = { loadRouteCatalog };
