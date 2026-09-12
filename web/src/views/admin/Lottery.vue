<template>
  <div>
    <div class="row">
      <h2>抽奖</h2>
    </div>
    <p class="muted">按团配置转盘、时机和指定中奖。保存后可关页，用「查看」看谁中了、有没有报名参团。未配置的团前台用平台默认奖池。也可从「拼团与成本」点抽奖跳到这里。</p>
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
      <el-table-column label="已抽" width="80">
        <template #default="{ row }">{{ row.drawCount || 0 }}</template>
      </el-table-column>
      <el-table-column label="排期" width="90">
        <template #default="{ row }">{{ statusText(row.status) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button size="small" @click="view(row)">查看</el-button>
          <el-button size="small" type="success" :disabled="row.status === 'cancelled'" @click="open(row)">配置</el-button>
        </template>
      </el-table-column>
    </el-table>
    <LotteryEditor v-model="showEditor" :schedule="cur" @saved="load" />

    <el-dialog v-model="showView" :title="viewTitle" width="880px" top="8vh">
      <p class="muted" style="margin-top:0">
        看中奖人、奖品、领奖，以及有没有报名本团。报名前抽的人可能还没报名。
      </p>
      <el-table :data="viewDraws" size="small" stripe max-height="420">
        <el-table-column prop="createdAt" label="时间" width="160" />
        <el-table-column prop="nickname" label="用户" width="110" />
        <el-table-column prop="phone" label="手机" width="130" />
        <el-table-column prop="prizeLabel" label="奖品" min-width="140" />
        <el-table-column label="报名" width="140">
          <template #default="{ row }">{{ row.enrollLabel || (row.enrolled ? "已报名" : "未报名") }}</template>
        </el-table-column>
        <el-table-column label="领取" width="80">
          <template #default="{ row }">{{ row.level === 9 ? "—" : row.claimed ? "已领" : "待领" }}</template>
        </el-table-column>
        <el-table-column label="阶段" width="80">
          <template #default="{ row }">{{ row.phase === "post" ? "行后" : "行前" }}</template>
        </el-table-column>
        <el-table-column label="指定" width="70">
          <template #default="{ row }">{{ row.assigned ? "是" : "" }}</template>
        </el-table-column>
      </el-table>
      <p v-if="!viewDraws.length" class="muted" style="margin-top:12px">还没有人抽过。</p>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import http from "@/api/http";
import LotteryEditor from "@/components/admin/LotteryEditor.vue";

const route = useRoute();
const list = ref([]);
const showEditor = ref(false);
const showView = ref(false);
const cur = ref(null);
const viewDraws = ref([]);

const viewTitle = computed(() => {
  const s = cur.value;
  return s ? `中奖 · ${s.route?.title || ""} ${s.startDate || ""}` : "中奖记录";
});

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
  showView.value = false;
  cur.value = asSchedule(row);
  showEditor.value = true;
}

async function view(row) {
  showEditor.value = false;
  cur.value = asSchedule(row);
  try {
    const data = (await http.get(`/admin/schedules/${row.scheduleId}/lottery`)).data;
    viewDraws.value = data.draws || [];
    showView.value = true;
  } catch (e) {
    ElMessage.error(e.message || "加载失败");
  }
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
