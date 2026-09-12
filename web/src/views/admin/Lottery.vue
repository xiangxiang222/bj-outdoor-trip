<template>
  <div>
    <div class="row">
      <h2>抽奖</h2>
    </div>
    <p class="muted">按团配置转盘、时机和指定中奖。未配置的团前台用平台默认奖池。也可从「拼团与成本」点抽奖跳到这里。</p>
    <el-table :data="list" stripe>
      <el-table-column label="行程" min-width="200">
        <template #default="{ row }">{{ row.routeTitle || "行程" }} {{ row.startDate }}</template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">{{ row.channel === "activity" ? "同城局" : "山野团" }}</template>
      </el-table-column>
      <el-table-column prop="drawLabel" label="抽奖" width="120" />
      <el-table-column prop="title" label="标题" min-width="140">
        <template #default="{ row }">{{ row.title || "—" }}</template>
      </el-table-column>
      <el-table-column label="排期" width="90">
        <template #default="{ row }">{{ statusText(row.status) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" type="success" :disabled="row.status === 'cancelled'" @click="open(row)">配置</el-button>
        </template>
      </el-table-column>
    </el-table>
    <LotteryEditor v-model="showEditor" :schedule="cur" @saved="load" />
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import http from "@/api/http";
import LotteryEditor from "@/components/admin/LotteryEditor.vue";

const route = useRoute();
const list = ref([]);
const showEditor = ref(false);
const cur = ref(null);

function statusText(s) {
  if (s === "cancelled") return "已解散";
  if (s === "confirmed") return "已成团";
  return "进行中";
}

function asSchedule(row) {
  return {
    id: row.scheduleId,
    startDate: row.startDate,
    route: { title: row.routeTitle },
  };
}

function open(row) {
  cur.value = asSchedule(row);
  showEditor.value = true;
}

async function load() {
  list.value = (await http.get("/admin/lotteries")).data || [];
  const preset = Number(route.query.scheduleId || 0);
  if (!preset) return;
  const hit = list.value.find((row) => Number(row.scheduleId) === preset);
  if (hit && hit.status !== "cancelled") open(hit);
}

onMounted(async () => {
  try {
    await load();
  } catch (e) {
    ElMessage.error(e.message || "加载失败");
  }
});
</script>
