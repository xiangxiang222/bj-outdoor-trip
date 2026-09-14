const { request } = require("./request");

function splitNames(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(/[,，;；\n]+/);
  const seen = {};
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const name = String(list[i] || "").trim();
    if (!name || seen[name]) continue;
    seen[name] = true;
    out.push(name);
  }
  return out;
}

function joinNames(list) {
  return splitNames(list).join("，");
}

function pickLabel(value, emptyText) {
  const names = splitNames(value);
  return names.length ? names.join("、") : emptyText || "";
}

function fetchCampuses(opts) {
  const data = {
    kind: (opts && opts.kind) || "school",
    q: (opts && opts.q) || "",
    school: (opts && opts.school) || "",
    college: (opts && opts.college) || "",
    page: (opts && opts.page) || 1,
    pageSize: (opts && opts.pageSize) || 20,
  };
  return request("/campuses", "GET", data);
}

function openCampusPick(opts) {
  const app = getApp();
  app.globalData.campusPick = {
    kind: (opts && opts.kind) || "school",
    school: (opts && opts.school) || "",
    college: (opts && opts.college) || "",
    multiple: !!(opts && opts.multiple),
    selected: splitNames(opts && opts.selected),
    title: (opts && opts.title) || "选择",
    onPick: opts && opts.onPick,
  };
  wx.navigateTo({ url: "/pages/campus-pick/campus-pick" });
}

module.exports = { splitNames, joinNames, pickLabel, fetchCampuses, openCampusPick };
