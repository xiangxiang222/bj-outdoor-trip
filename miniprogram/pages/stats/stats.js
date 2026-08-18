const { request, showError } = require("../../utils/request");

const GENDER_COLORS = { 男: "#2d6a4f", 女: "#bc4749", 未填: "#9c9a92" };
const AGE_COLORS = ["#1b4332", "#2d6a4f", "#40916c", "#74c69d", "#95d5b2", "#d8f3dc"];

function colorize(list, palette) {
  return list.map((item, i) => ({
    ...item,
    color: palette[item.name] || palette[i % palette.length],
  }));
}

function drawPie(node, width, height, slices, donut) {
  const dpr = wx.getSystemInfoSync().pixelRatio || 2;
  node.width = Math.floor(width * dpr);
  node.height = Math.floor(height * dpr);
  const ctx = node.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 16;
  const total = slices.reduce((sum, item) => sum + Number(item.value || 0), 0);

  if (!total) {
    ctx.fillStyle = "#e6dfd2";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6b705c";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("暂无数据", cx, cy);
    return;
  }

  let start = -Math.PI / 2;
  slices.forEach((slice) => {
    const angle = (Number(slice.value) / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    start += angle;
  });

  if (donut) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.56, 0, Math.PI * 2);
    ctx.fillStyle = "#f4efe6";
    ctx.fill();
  }
}

function paint(id, slices, donut) {
  wx.createSelectorQuery()
    .select("#" + id)
    .fields({ node: true, size: true })
    .exec((res) => {
      const box = res && res[0];
      if (!box || !box.node || !box.width) return;
      drawPie(box.node, box.width, box.height, slices, donut);
    });
}

Page({
  data: { gender: [], age: [], hometown: [] },
  async onLoad(q) {
    try {
      const d = (await request("/schedules/" + q.id + "/demographics")).data;
      const gender = colorize(d.gender || [], GENDER_COLORS);
      const age = colorize((d.age || []).filter((x) => x.value), AGE_COLORS);
      const max = Math.max(1, ...(d.hometown || []).map((x) => x.value));
      this.setData(
        {
          gender,
          age,
          hometown: (d.hometown || []).map((x) => ({ ...x, pct: Math.round((x.value / max) * 100) })),
        },
        () => {
          wx.nextTick(() => {
            paint("genderPie", this.data.gender, true);
            paint("agePie", this.data.age, false);
          });
        }
      );
    } catch (e) {
      showError("画像加载失败", e);
    }
  },
});
