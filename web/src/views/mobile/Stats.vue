<template>
  <LoadRow v-if="!ready" />
  <div v-else-if="loadError" class="card"><div class="pad" role="alert">
    <strong>出行画像暂不可用</strong>
    <p class="muted">{{ loadError }}</p>
    <button class="btn ghost" type="button" @click="load">重新加载</button>
  </div></div>
  <div v-else>
    <p class="muted">报名后可查看本团出行构成，方便判断是否适合一起走。</p>
    <div ref="g1" style="height:240px"></div>
    <div ref="g2" style="height:240px"></div>
    <div ref="g3" style="height:280px"></div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";
import * as echarts from "echarts";
import http from "@/api/http";
import LoadRow from "@/components/LoadRow.vue";
import { readLook, SIZES } from "@/utils/appearance";

const px = (n) => Math.round(n * (SIZES[readLook().size] || 1));

const route = useRoute();
const g1 = ref();
const g2 = ref();
const g3 = ref();
const ready = ref(false);
const loadError = ref("");
let loading = false;
let disposed = false;
const charts = [];
onUnmounted(() => {
  disposed = true;
  charts.forEach((chart) => chart.dispose());
});

onMounted(load);
async function load() {
  if (loading) return;
  loading = true;
  ready.value = false;
  loadError.value = "";
  charts.splice(0).forEach((chart) => chart.dispose());
  let d;
  try {
    d = (await http.get(`/schedules/${route.params.id}/demographics`)).data;
  } catch (e) {
    d = null;
    loadError.value = e.message || "请检查网络或稍后重试。";
  } finally {
    loading = false;
    ready.value = true;
  }
  if (!d || disposed) return;
  await nextTick();
  if (disposed) return;
  const chart1 = echarts.init(g1.value);
  const chart2 = echarts.init(g2.value);
  const chart3 = echarts.init(g3.value);
  charts.push(chart1, chart2, chart3);
  chart1.setOption({
    title: { text: "男女比例", left: "center", textStyle: { fontSize: px(14) } },
    tooltip: { trigger: "item" },
    series: [{ type: "pie", radius: ["36%", "62%"], data: d.gender }],
  });
  chart2.setOption({
    title: { text: "年龄段", left: "center", textStyle: { fontSize: px(14) } },
    tooltip: { trigger: "item" },
    series: [{ type: "pie", radius: "62%", data: d.age.filter((x) => x.value) }],
  });
  chart3.setOption({
    title: { text: "籍贯（身份证前缀）", left: "center", textStyle: { fontSize: px(14) } },
    tooltip: {},
    xAxis: { type: "category", data: d.hometown.map((x) => x.name), axisLabel: { rotate: 30, fontSize: px(10) } },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: d.hometown.map((x) => x.value), itemStyle: { color: "#5b3b8c" } }],
  });
}
</script>
