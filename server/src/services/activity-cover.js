const KINDS = [
  { key: "掼蛋", file: "guandan.png", aliases: ["打牌"] },
  { key: "跑步", file: "run.png", aliases: ["夜跑", "慢跑"] },
  { key: "电影", file: "movie.png", aliases: ["观影"] },
  { key: "招募", file: "recruit.png", aliases: ["招新"] },
];

function activityCoverPath(text) {
  const blob = String(text || "");
  const hit = KINDS.find((k) => blob.includes(k.key) || (k.aliases || []).some((name) => blob.includes(name)));
  return `/static/activities/${hit ? hit.file : "city.png"}`;
}

function activityCoverBlob(route, sch) {
  let tags = [];
  try {
    tags = JSON.parse(route?.tags_json || "[]");
  } catch {
    tags = [];
  }
  if (!Array.isArray(tags)) tags = [];
  return [route?.title, route?.subtitle, route?.category, sch?.notes, ...tags].filter(Boolean).join(" ");
}

module.exports = { KINDS, activityCoverPath, activityCoverBlob };
