<template>
  <div class="ops-dashboard" v-loading="loading" element-loading-text="正在汇总经营数据">
    <div class="ops-page-heading">
      <div><h2>经营概览</h2><p>每一次出发，都从这里开始。<span v-if="updatedAt"> 数据更新于 {{ updatedAt }}</span></p></div>
      <button class="ops-refresh" type="button" :disabled="loading" @click="load"><OperationsIcon name="refresh" />刷新数据</button>
    </div>
    <div v-if="error" class="ops-error" role="alert"><span>{{ error }}</span><button type="button" @click="load">重新加载</button></div>
    <section class="ops-welcome">
      <div><span class="ops-eyebrow">TOGETHER, INTO THE WILD</span><h3>让每一次出发，都井然有序。</h3><p>从一条好线路，到一段被认真照顾的旅程。</p></div>
      <router-link class="ops-welcome-action" to="/admin/schedules">安排下一次出发 <OperationsIcon name="arrow" /></router-link>
    </section>
    <div class="ops-metrics">
      <div v-for="item in metrics" :key="item.label" class="ops-metric">
        <span class="ops-metric-label">{{ item.label }}</span><span class="ops-metric-icon"><OperationsIcon :name="item.icon" /></span>
        <strong>{{ updatedAt ? item.value : '—' }}</strong><small>{{ item.note }}</small>
      </div>
    </div>
    <div v-if="d.pending" class="admin-alert"><OperationsIcon name="clock" /><span>有 {{ d.pending }} 位企业团出行人待结算，请及时核对费用。</span><router-link to="/admin/schedules">去处理 →</router-link></div>
    <div class="ops-charts">
      <section class="ops-panel">
        <div class="ops-panel-head"><div><h3>热门线路表现</h3><p>按累计报名人数排序 · 前 8 条线路</p></div><small>人数 / 实收</small></div>
        <div ref="bar" class="ops-chart" role="img" aria-label="热门线路报名人数与实收金额图表"></div>
      </section>
      <section class="ops-panel">
        <div class="ops-panel-head"><div><h3>出行时长偏好</h3><p>按行程天数统计报名人数</p></div><small>累计报名</small></div>
        <div ref="pie" class="ops-chart" role="img" aria-label="不同行程天数的报名人数分布图表"></div>
      </section>
    </div>
    <section class="ops-panel ops-route-performance">
      <div class="ops-panel-head"><div><h3>线路经营明细</h3><p>累计有效报名与实际收款，取消的报名不计入。</p></div><router-link to="/admin/routes">管理线路 →</router-link></div>
      <el-table :data="d.byRoute" :empty-text="loading ? '加载中…' : '还没有线路经营数据'">
        <el-table-column label="排名" width="75"><template #default="{ $index }"><span class="ops-ranking" :class="{ 'is-top': $index < 3 }">{{ String($index + 1).padStart(2, '0') }}</span></template></el-table-column>
        <el-table-column prop="title" label="线路名称" min-width="220" />
        <el-table-column label="行程天数" width="110"><template #default="{ row }">{{ row.days }} 天</template></el-table-column>
        <el-table-column label="累计报名" width="120" align="right"><template #default="{ row }">{{ number(row.people) }} 人</template></el-table-column>
        <el-table-column label="实收金额" width="150" align="right"><template #default="{ row }">¥ {{ money(row.revenue) }}</template></el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from "vue";
import * as echarts from "echarts";
import http from "@/api/http";
import OperationsIcon from "@/components/OperationsIcon.vue";

const d = reactive({ routeCount: 0, userCount: 0, enrollCount: 0, revenue: 0, pending: 0, byRoute: [], byDay: [] });
const bar = ref();
const pie = ref();
const loading = ref(false);
const error = ref("");
const updatedAt = ref("");
const number = (n) => Number(n || 0).toLocaleString("zh-CN");
const money = (n) => Number(n || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const metrics = computed(() => [
  { label: "目的地线路", value: number(d.routeCount), icon: "route", note: "全部线路 · 含待审与已下架" },
  { label: "同行的伙伴", value: number(d.userCount), icon: "people", note: "平台注册用户 · 不含已注销" },
  { label: "累计报名人次", value: number(d.enrollCount), icon: "calendar", note: "有效报名 · 不含已取消" },
  { label: "累计实收金额", value: `¥ ${money(d.revenue)}`, icon: "wallet", note: "实际收款 · 以支付账目为准" },
]);
let barChart;
let pieChart;
let observer;
let disposed = false;

function drawCharts() {
  if (!bar.value || !pie.value || disposed) return;
  barChart ||= echarts.init(bar.value);
  pieChart ||= echarts.init(pie.value);
  const popular = d.byRoute.slice(0, 8);
  const font = '"PingFang SC", sans-serif';
  const muted = "#b5a4c0";
  barChart.setOption({
    animationDuration: 500,
    textStyle: { fontFamily: font },
    tooltip: { trigger: "axis", backgroundColor: "#fff", borderColor: "#eae1f2", textStyle: { color: "#79618c", fontSize: 11 } },
    legend: { top: 12, right: 24, itemWidth: 11, itemHeight: 7, textStyle: { color: muted, fontSize: 9 }, data: ["报名人数", "实收金额"] },
    grid: { top: 55, left: 50, right: 55, bottom: 55 },
    xAxis: { type: "category", data: popular.map((x) => x.title), axisLine: { lineStyle: { color: "#f1ebf5" } }, axisTick: { show: false }, axisLabel: { color: muted, fontSize: 9, interval: 0, formatter: (value) => value.length > 5 ? value.slice(0, 5) + "…" : value } },
    yAxis: [
      { type: "value", minInterval: 1, axisLabel: { color: muted, fontSize: 9 }, splitLine: { lineStyle: { color: "#f5f0f8", type: "dashed" } } },
      { type: "value", axisLabel: { color: muted, fontSize: 9, formatter: (value) => value >= 10000 ? (value / 10000).toFixed(1) + "万" : value }, splitLine: { show: false } },
    ],
    graphic: popular.length ? [] : [{ type: "text", left: "center", top: "45%", style: { text: "发布线路后，在这里查看经营表现", fill: muted, fontSize: 11 } }],
    series: [
      { name: "报名人数", type: "bar", barMaxWidth: 22, data: popular.map((x) => x.people), itemStyle: { color: "#a98bbf", borderRadius: [5, 5, 0, 0] } },
      { name: "实收金额", type: "line", smooth: true, symbolSize: 5, yAxisIndex: 1, data: popular.map((x) => x.revenue), lineStyle: { width: 2 }, itemStyle: { color: "#c9ae7b" } },
    ],
  }, true);
  const distribution = d.byDay.filter((x) => Number(x.people) > 0);
  const total = distribution.reduce((sum, item) => sum + Number(item.people), 0);
  pieChart.setOption({
    animationDuration: 500,
    textStyle: { fontFamily: font },
    tooltip: { trigger: "item", formatter: "{b}<br/>{c} 人次 · {d}%", backgroundColor: "#fff", borderColor: "#eae1f2", textStyle: { color: "#79618c", fontSize: 11 } },
    color: ["#9775b2", "#c5afd7", "#dbccba", "#b2bec8", "#e5d9ee"],
    legend: { bottom: 19, itemWidth: 7, itemHeight: 7, icon: "circle", textStyle: { fontSize: 10, color: muted } },
    graphic: [{ type: "text", left: "center", top: "39%", style: { text: total ? number(total) : "暂无数据", textAlign: "center", fontSize: total ? 29 : 15, fontWeight: 500, fill: "#76518f" } }, { type: "text", left: "center", top: "53%", style: { text: total ? "累计报名人次" : "报名后将显示出行偏好", fill: muted, fontSize: 9 } }],
    series: [{ type: "pie", radius: ["47%", "64%"], center: ["50%", "45%"], label: { show: false }, emphasis: { scaleSize: 4 }, itemStyle: { borderColor: "#fff", borderWidth: 4, borderRadius: 5 }, data: distribution.map((x) => ({ name: x.days + " 日游", value: x.people })) }],
  }, true);
}

async function load() {
  if (loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const res = await http.get("/admin/dashboard");
    if (disposed) return;
    Object.assign(d, res.data);
    updatedAt.value = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" }).format(new Date());
    await nextTick();
    drawCharts();
  } catch (e) {
    error.value = e.message || "经营数据暂时未能加载，请重试。";
  } finally {
    loading.value = false;
  }
}
function resize() { barChart?.resize(); pieChart?.resize(); }
onMounted(() => {
  load();
  observer = new ResizeObserver(resize);
  if (bar.value) observer.observe(bar.value);
  if (pie.value) observer.observe(pie.value);
});
onUnmounted(() => { disposed = true; observer?.disconnect(); barChart?.dispose(); pieChart?.dispose(); });
</script>
