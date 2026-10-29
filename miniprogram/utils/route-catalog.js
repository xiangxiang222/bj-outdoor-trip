const { request } = require("./request");
const { withLocalMediaList } = require("./media");
const { decorateRoute } = require("./route-presentation");

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
    if (!Array.isArray(res.data)) throw new Error("线路加载失败，请重试");
    return { list: withLocalMediaList(asList(res.data)).map(decorateRoute), err: "" };
  } catch (err) {
    return { list: [], err: (err && err.message) || "加载失败" };
  }
}

module.exports = { loadRouteCatalog };
