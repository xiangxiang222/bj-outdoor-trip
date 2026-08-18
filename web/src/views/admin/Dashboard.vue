<template>
  <div>
    <h2>数据看板</h2>
    <div class="kpi">
      <div class="card"><div class="muted">线路</div><div class="n">{{ d.routeCount }}</div></div>
      <div class="card"><div class="muted">用户</div><div class="n">{{ d.userCount }}</div></div>
      <div class="card"><div class="muted">报名人数</div><div class="n">{{ d.enrollCount }}</div></div>
      <div class="card"><div class="muted">已收金额</div><div class="n">¥{{ d.revenue }}</div></div>
    </div>
    <p class="muted">公司挂账待结算 {{ d.pending }} 人</p>
    <el-row :gutter="16" style="margin-top:16px">
      <el-col :span="14">
        <div class="card" style="padding:12px">
          <div ref="bar" style="height:360px"></div>
        </div>
      </el-col>
      <el-col :span="10">
        <div class="card" style="padding:12px">
          <div ref="pie" style="height:360px"></div>
        </div>
      </el-col>
    </el-row>
    <el-table :data="d.byRoute" style="margin-top:16px" stripe>
      <el-table-column prop="title" label="线路" />
      <el-table-column prop="days" label="天数" width="80" />
      <el-table-column prop="people" label="报名人数" width="120" />
      <el-table-column prop="revenue" label="收入" width="120" />
    </el-table>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import * as echarts from "echarts";
import http from "@/api/http";

const d = reactive({ routeCount: 0, userCount: 0, enrollCount: 0, revenue: 0, pending: 0, byRoute: [], byDay: [] });
const bar = ref();
const pie = ref();

onMounted(async () => {
  const res = await http.get("/admin/dashboard");
  Object.assign(d, res.data);
  echarts.init(bar.value).setOption({
    title: { text: "各线路人数 / 收入" },
    tooltip: { trigger: "axis" },
    legend: { data: ["人数", "收入"] },
    xAxis: { type: "category", data: d.byRoute.map((x) => x.title), axisLabel: { rotate: 28, fontSize: 10 } },
    yAxis: [{ type: "value" }, { type: "value" }],
    series: [
      { name: "人数", type: "bar", data: d.byRoute.map((x) => x.people), itemStyle: { color: "#2d6a4f" } },
      { name: "收入", type: "line", yAxisIndex: 1, data: d.byRoute.map((x) => x.revenue), itemStyle: { color: "#bc4749" } },
    ],
  });
  echarts.init(pie.value).setOption({
    title: { text: "按天数分布" },
    tooltip: { trigger: "item" },
    series: [{ type: "pie", radius: "65%", data: d.byDay.map((x) => ({ name: x.days + "日", value: x.people })) }],
  });
});
</script>
