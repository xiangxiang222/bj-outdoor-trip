<template>
  <div>
    <p class="muted">报名后可查看本团出行构成，方便判断是否适合一起走。</p>
    <div ref="g1" style="height:240px"></div>
    <div ref="g2" style="height:240px"></div>
    <div ref="g3" style="height:280px"></div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import * as echarts from "echarts";
import http from "@/api/http";

const route = useRoute();
const g1 = ref();
const g2 = ref();
const g3 = ref();

onMounted(async () => {
  const d = (await http.get(`/schedules/${route.params.id}/demographics`)).data;
  echarts.init(g1.value).setOption({
    title: { text: "男女比例", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "item" },
    series: [{ type: "pie", radius: ["36%", "62%"], data: d.gender }],
  });
  echarts.init(g2.value).setOption({
    title: { text: "年龄段", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "item" },
    series: [{ type: "pie", radius: "62%", data: d.age.filter((x) => x.value) }],
  });
  echarts.init(g3.value).setOption({
    title: { text: "籍贯（身份证前缀）", left: "center", textStyle: { fontSize: 14 } },
    tooltip: {},
    xAxis: { type: "category", data: d.hometown.map((x) => x.name), axisLabel: { rotate: 30, fontSize: 10 } },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: d.hometown.map((x) => x.value), itemStyle: { color: "#2d6a4f" } }],
  });
});
</script>
