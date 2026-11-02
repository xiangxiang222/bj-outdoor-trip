const DEFAULT_PREFERENCES = [
  { key: "great-wall", name: "长城", primary: true, categories: ["长城"], tags: ["长城"] },
  { key: "hiking", name: "徒步登山", primary: true, categories: ["登山"], tags: ["徒步", "登山"] },
  { key: "coast", name: "海边", primary: true, categories: ["海滨"], tags: ["海滨", "海边"] },
  { key: "family", name: "亲子", categories: [], tags: ["亲子"] },
  { key: "photography", name: "摄影", categories: [], tags: ["摄影"] },
  { key: "camping", name: "露营", categories: [], tags: ["露营"] },
  { key: "grassland", name: "草原", categories: ["草原"], tags: ["草原"] },
  { key: "culture", name: "人文", categories: ["文化"], tags: ["文化", "人文"] },
  { key: "water", name: "玩水", categories: ["玩水"], tags: ["玩水", "漂流"] },
  { key: "stargazing", name: "星空", categories: [], tags: ["星空", "看星空"] },
];

function fail(status, message, code = "ROUTE_PREFERENCE_INVALID") {
  throw Object.assign(new Error(message), { status, code });
}

// Called by schema initialization, never by a public request. Existing rows,
// including edited or disabled defaults, remain under the operator's control.
function initializeRoutePreferences(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS route_preferences (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
    sort_order INTEGER NOT NULL DEFAULT 99 CHECK(sort_order >= 0),
    status TEXT NOT NULL DEFAULT 'on' CHECK(status IN ('on','off')),
    categories_json TEXT NOT NULL DEFAULT '[]',
    tags_json TEXT NOT NULL DEFAULT '[]'
  )`);
  const insert = database.prepare(`INSERT OR IGNORE INTO route_preferences
    (key,name,is_primary,sort_order,status,categories_json,tags_json) VALUES (?,?,?,?,?,?,?)`);
  database.transaction(() => {
    DEFAULT_PREFERENCES.forEach((item, index) => insert.run(
      item.key, item.name, item.primary ? 1 : 0, (index + 1) * 10, "on", JSON.stringify(item.categories), JSON.stringify(item.tags)
    ));
  })();
}

function preferenceView(row) {
  return {
    key: row.key,
    name: row.name,
    primary: Boolean(row.is_primary),
    sortOrder: row.sort_order,
    status: row.status,
    categories: JSON.parse(row.categories_json),
    tags: JSON.parse(row.tags_json),
  };
}

function ruleWhere(preference) {
  const clauses = [];
  const args = [];
  if (preference.categories.length) {
    clauses.push(`r.category IN (${preference.categories.map(() => "?").join(",")})`);
    args.push(...preference.categories);
  }
  if (preference.tags.length) {
    // Legacy routes may contain malformed JSON or a JSON object. Neither is a
    // tag array; CASE also keeps json_each away from malformed input.
    const tags = "CASE WHEN json_valid(r.tags_json) THEN CASE WHEN json_type(r.tags_json)='array' THEN r.tags_json ELSE '[]' END ELSE '[]' END";
    clauses.push(`EXISTS (SELECT 1 FROM json_each(${tags}) AS preference_tag
      WHERE preference_tag.type='text' AND preference_tag.value IN (${preference.tags.map(() => "?").join(",")}))`);
    args.push(...preference.tags);
  }
  return { where: "(" + clauses.join(" OR ") + ")", args };
}

function scalar(value, name) {
  if (value == null) return "";
  if (typeof value !== "string" && typeof value !== "number") fail(400, `${name}格式不正确`, "ROUTE_FILTER_INVALID");
  return String(value);
}

// Public routes and preference counts share this visibility and base-filter
// predicate. Facets intentionally ignore preference and legacy category/tag.
function catalogWhere(database, query = {}, { facets = false } = {}) {
  let where = "r.status='on' AND IFNULL(r.review_status,'approved')='approved' AND NOT EXISTS (SELECT 1 FROM schedules activity WHERE activity.route_id=r.id AND IFNULL(activity.channel,'trip')='activity')";
  const args = [];
  const days = scalar(query.days, "天数");
  if (days === "multi") where += " AND r.days>=4";
  else if (days) {
    const number = Number(days);
    if (!Number.isSafeInteger(number) || number < 0 || number > 365) fail(400, "天数格式不正确", "ROUTE_FILTER_INVALID");
    where += " AND r.days=?";
    args.push(number);
  }
  for (const [key, column] of [["city", "region"], ["difficulty", "difficulty"]]) {
    const value = scalar(query[key], key);
    if (!value) continue;
    where += key === "city" ? ` AND r.${column} LIKE ?` : ` AND r.${column}=?`;
    args.push(key === "city" ? `%${value}%` : value);
  }
  const q = scalar(query.q, "关键词");
  if (q) {
    where += " AND (r.title LIKE ? OR r.region LIKE ? OR r.tags_json LIKE ?)";
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (!facets) {
    const key = scalar(query.preference, "出游偏好");
    const category = scalar(query.category, "线路分类");
    const tag = scalar(query.tag, "玩法标签");
    if (key && (category || tag)) fail(400, "出游偏好不能与旧版分类或玩法筛选同时使用", "ROUTE_PREFERENCE_MIXED_FILTERS");
    if (key) {
      const row = database.prepare("SELECT * FROM route_preferences WHERE key=? AND status='on'").get(key);
      if (!row) fail(400, "该出游偏好不存在或已停用，请重新选择", "ROUTE_PREFERENCE_UNAVAILABLE");
      const rule = ruleWhere(preferenceView(row));
      where += " AND " + rule.where;
      args.push(...rule.args);
    } else {
      if (category) { where += " AND r.category=?"; args.push(category); }
      // Preserve the legacy endpoint for older clients; new preferences use
      // exact array-member matching above rather than this historical LIKE.
      if (tag) { where += " AND (r.category=? OR r.tags_json LIKE ?)"; args.push(tag, `%${tag}%`); }
    }
  }
  return { where, args };
}

function countPreference(database, base, preference) {
  const rule = ruleWhere(preference);
  return database.prepare(`SELECT COUNT(*) AS count FROM routes r WHERE ${base.where} AND ${rule.where}`).get(...base.args, ...rule.args).count;
}

function publicPreferences(database, query = {}) {
  const base = catalogWhere(database, query, { facets: true });
  const total = database.prepare(`SELECT COUNT(*) AS count FROM routes r WHERE ${base.where}`).get(...base.args).count;
  const options = database.prepare("SELECT * FROM route_preferences WHERE status='on' ORDER BY sort_order,key").all().map((row) => {
    const preference = preferenceView(row);
    return { key: preference.key, name: preference.name, primary: preference.primary, count: countPreference(database, base, preference) };
  });
  return { options, total };
}

function adminPreferences(database) {
  const base = catalogWhere(database);
  return database.prepare("SELECT * FROM route_preferences ORDER BY sort_order,key").all().map((row) => {
    const preference = preferenceView(row);
    return { ...preference, count: countPreference(database, base, preference) };
  });
}

function normalizedRules(value, label) {
  if (!Array.isArray(value) || value.length > 50) fail(400, `${label}应为不超过 50 项的数组`);
  const rules = value.map((item) => {
    if (typeof item !== "string" || !item.trim() || item.trim().length > 64) fail(400, `${label}每项应为 1 至 64 字的文本`);
    return item.trim();
  });
  return [...new Set(rules)];
}

function normalizePreference(input, previous) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail(400, "偏好配置格式不正确");
  if (previous && Object.hasOwn(input, "key") && input.key !== previous.key) fail(400, "偏好标识创建后不可修改");
  const value = { primary: false, sortOrder: 99, status: "on", categories: [], tags: [], ...previous, ...input };
  if (typeof value.key !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(value.key)) fail(400, "偏好标识须为小写英文字母开头的 1 至 64 位字母、数字、短横线或下划线");
  if (typeof value.name !== "string" || !value.name.trim() || value.name.trim().length > 32) fail(400, "偏好名称应为 1 至 32 字");
  if (typeof value.primary !== "boolean") fail(400, "首页常驻须为布尔值");
  if (!Number.isSafeInteger(value.sortOrder) || value.sortOrder < 0 || value.sortOrder > 1000000) fail(400, "排序应为 0 至 1000000 的整数");
  if (value.status !== "on" && value.status !== "off") fail(400, "偏好状态只能为 on 或 off");
  const categories = normalizedRules(value.categories, "分类规则");
  const tags = normalizedRules(value.tags, "标签规则");
  if (!categories.length && !tags.length) fail(400, "请至少配置一条分类或标签规则");
  return { key: value.key, name: value.name.trim(), primary: value.primary, sortOrder: value.sortOrder, status: value.status, categories, tags };
}

function savePreference(database, input, key) {
  let previous;
  if (key !== undefined) {
    const row = database.prepare("SELECT * FROM route_preferences WHERE key=?").get(key);
    if (!row) fail(404, "出游偏好不存在", "ROUTE_PREFERENCE_NOT_FOUND");
    previous = preferenceView(row);
  }
  const value = normalizePreference(input, previous);
  if (!previous && database.prepare("SELECT 1 FROM route_preferences WHERE key=?").get(value.key)) fail(409, "偏好标识已存在", "ROUTE_PREFERENCE_EXISTS");
  if (previous) {
    database.prepare("UPDATE route_preferences SET name=?,is_primary=?,sort_order=?,status=?,categories_json=?,tags_json=? WHERE key=?")
      .run(value.name, value.primary ? 1 : 0, value.sortOrder, value.status, JSON.stringify(value.categories), JSON.stringify(value.tags), value.key);
  } else {
    database.prepare("INSERT INTO route_preferences (name,is_primary,sort_order,status,categories_json,tags_json,key) VALUES (?,?,?,?,?,?,?)")
      .run(value.name, value.primary ? 1 : 0, value.sortOrder, value.status, JSON.stringify(value.categories), JSON.stringify(value.tags), value.key);
  }
  return { ...value, count: countPreference(database, catalogWhere(database), value) };
}

function disablePreference(database, key) {
  return savePreference(database, { status: "off" }, key);
}

module.exports = { initializeRoutePreferences, catalogWhere, publicPreferences, adminPreferences, savePreference, disablePreference };
