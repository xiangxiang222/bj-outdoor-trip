const OFFER_TYPES = [
  { key: "early", label: "早鸟团", color: "#2d6a4f" },
  { key: "deal", label: "特惠团", color: "#bc4749" },
  { key: "free", label: "免费团", color: "#40916c" },
  { key: "family", label: "全家团", color: "#c77d3a" },
  { key: "full", label: "全价团", color: "#1b4332" },
];

function countOn(schedules, date) {
  return (schedules || []).filter((s) => s.startDate === date && s.status !== "cancelled").length;
}

function buildCalendar(schedules) {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 15; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    days.push({ date: key, label: d.getMonth() + 1 + "/" + d.getDate(), count: countOn(schedules, key) });
  }
  return days;
}

module.exports = { OFFER_TYPES, countOn, buildCalendar };
