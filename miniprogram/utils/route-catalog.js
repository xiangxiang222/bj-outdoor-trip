const { request } = require("./request");
const { withLocalMediaList } = require("./media");
const { decorateRoute } = require("./route-presentation");

function asList(rows) {
  return Array.isArray(rows) ? rows : [];
}

function queryString({ q = "", days = 0, preference = "" } = {}) {
  const params = [];
  const keyword = String(q || "").trim();
  if (keyword) params.push("q=" + encodeURIComponent(keyword));
  if (days) params.push("days=" + encodeURIComponent(days));
  if (preference) params.push("preference=" + encodeURIComponent(preference));
  return params.length ? "?" + params.join("&") : "";
}

async function loadRouteCatalog({ q = "", days = 0, preference = "" } = {}) {
  try {
    const res = await request("/routes" + queryString({ q, days, preference }));
    if (!Array.isArray(res.data)) throw new Error("线路加载失败，请重试");
    return { list: withLocalMediaList(asList(res.data)).map(decorateRoute), err: "" };
  } catch (err) {
    const code = (err && err.code) || "";
    return { list: [], err: code === "ROUTE_PREFERENCE_UNAVAILABLE" ? "该出游偏好不存在或已停用，请重新选择" : (err && err.message) || "加载失败", code };
  }
}

async function loadRoutePreferences({ q = "", days = 0 } = {}) {
  try {
    const res = await request("/route-preferences" + queryString({ q, days }));
    const data = res && res.data;
    if (!data || !Array.isArray(data.options) || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error("出游偏好加载失败，请重试");
    const seen = new Set();
    const options = data.options.map((item) => {
      if (!item || typeof item.key !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(item.key) || seen.has(item.key)
        || typeof item.name !== "string" || !item.name.trim() || typeof item.primary !== "boolean"
        || !Number.isSafeInteger(item.count) || item.count < 0 || item.count > data.total) throw new Error("出游偏好加载失败，请重试");
      seen.add(item.key);
      return { key: item.key, name: item.name, primary: item.primary, count: item.count };
    });
    return { options, total: data.total, err: "" };
  } catch (err) {
    return { options: [], total: null, err: (err && err.message) || "出游偏好加载失败，请重试" };
  }
}

function preferenceView(options = [], selected = "", expanded = false, previousName = "") {
  const rows = asList(options);
  const chosen = rows.find((item) => item.key === selected);
  return {
    primary: rows.filter((item) => item.primary || (!expanded && item.key === selected)),
    more: rows.filter((item) => !item.primary && (item.count > 0 || item.key === selected)),
    selectedName: chosen ? chosen.name : previousName || ({ "great-wall": "长城", hiking: "徒步登山", coast: "海边" }[selected]) || selected,
  };
}

module.exports = { loadRouteCatalog, loadRoutePreferences, preferenceView };
