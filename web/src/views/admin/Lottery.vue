<template>
  <div>
    <div class="row">
      <h2>抽奖</h2>
    </div>
    <p class="muted">按团配置转盘、时机和指定中奖。保存后可关页，用「查看」看奖品详情和中奖人。未配置的团前台用平台默认奖池。也可从「拼团与成本」点抽奖跳到这里。</p>
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

    <el-dialog v-model="showView" class="lottery-view-dialog" :title="viewTitle" width="960px" top="6vh">
      <p class="muted" style="margin-top:0">
        {{ viewHint }}
      </p>
      <p v-if="viewNote" class="muted">备注：{{ viewNote }}</p>

      <div class="row" style="margin:4px 0 10px"><strong>奖品详情</strong></div>
      <el-table :data="viewPrizes" size="small" stripe>
        <el-table-column prop="name" label="名称" min-width="140">
          <template #default="{ row }">{{ row.name || row.label || "—" }}</template>
        </el-table-column>
        <el-table-column label="等级" width="90">
          <template #default="{ row }">{{ levelText(row.level) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ kindText(row.kind) }}</template>
        </el-table-column>
        <el-table-column label="积分" width="70">
          <template #default="{ row }">{{ row.kind === "points" ? row.points || 0 : "—" }}</template>
        </el-table-column>
        <el-table-column label="中奖率" width="80">
          <template #default="{ row }">{{ row.rate != null ? row.rate + "%" : "—" }}</template>
        </el-table-column>
        <el-table-column label="库存" width="80">
          <template #default="{ row }">{{ stockText(row.stock) }}</template>
        </el-table-column>
        <el-table-column label="剩余" width="80">
          <template #default="{ row }">{{ stockText(row.remain) }}</template>
        </el-table-column>
        <el-table-column label="已中" width="70">
          <template #default="{ row }">{{ row.winCount || 0 }}</template>
        </el-table-column>
      </el-table>
      <p v-if="!viewPrizes.length" class="muted" style="margin-top:8px">还没有奖品。</p>

      <div v-if="viewAssigns.length" class="row" style="margin:18px 0 10px"><strong>指定中奖</strong></div>
      <el-table v-if="viewAssigns.length" :data="viewAssigns" size="small" stripe>
        <el-table-column prop="nickname" label="用户" width="120" />
        <el-table-column prop="phone" label="手机" width="130" />
        <el-table-column prop="prizeName" label="奖品" min-width="140" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">{{ row.usedAt ? "已抽走" : "待抽" }}</template>
        </el-table-column>
        <el-table-column prop="note" label="备注" />
      </el-table>

      <div class="row" style="margin:18px 0 10px"><strong>中奖人</strong></div>
      <el-table :data="viewDraws" size="small" stripe max-height="360">
        <el-table-column prop="createdAt" label="时间" width="160" />
        <el-table-column prop="nickname" label="用户" width="110" />
        <el-table-column prop="phone" label="手机" width="130" />
        <el-table-column label="会员" width="70">
          <template #default="{ row }">{{ row.isMember ? "是" : "—" }}</template>
        </el-table-column>
        <el-table-column prop="prizeLabel" label="奖品" min-width="130" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ kindText(row.prizeKind) }}</template>
        </el-table-column>
        <el-table-column label="报名" width="130">
          <template #default="{ row }">{{ row.enrollLabel || (row.enrolled ? "已报名" : "未报名") }}</template>
        </el-table-column>
        <el-table-column label="领取" width="90">
          <template #default="{ row }">{{ claimText(row) }}</template>
        </el-table-column>
        <el-table-column label="阶段" width="70">
          <template #default="{ row }">{{ row.phase === "post" ? "行后" : "行前" }}</template>
        </el-table-column>
        <el-table-column label="指定" width="60">
          <template #default="{ row }">{{ row.assigned ? "是" : "" }}</template>
        </el-table-column>
      </el-table>
      <p v-if="!viewDraws.length" class="muted" style="margin-top:12px">还没有人抽过。</p>
      <template #footer>
        <el-button @click="showView = false">关闭</el-button>
      </template>
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
const viewPrizes = ref([]);
const viewAssigns = ref([]);
const viewMeta = ref({ configured: false, enabled: false, drawMode: "", title: "", note: "" });

const viewTitle = computed(() => {
  const s = cur.value;
  return s ? `查看 · ${s.route?.title || ""} ${s.startDate || ""}` : "抽奖详情";
});
const viewHint = computed(() => {
  const m = viewMeta.value;
  const mode = MODE_TEXT[m.drawMode] || "未开";
  if (!m.configured) return "未单独配置，下面是平台默认奖池。报名前抽的人可能还没报名。";
  if (!m.enabled) return `已配置但已关闭，前台仍用默认奖池。本团标题「${m.title || "本团抽奖"}」，时机 ${mode}。`;
  return `「${m.title || "本团抽奖"}」· ${mode}。报名前抽的人可能还没报名。`;
});
const viewNote = computed(() => viewMeta.value.note || "");

const MODE_TEXT = { off: "未开", pre: "报名前", enroll: "报名后", both: "前后都抽" };

function levelText(n) {
  if (n === 1) return "一等奖";
  if (n === 2) return "二等奖";
  if (n === 3) return "三等奖";
  if (n === 9) return "谢谢参与";
  return "普通";
}
function kindText(kind) {
  if (kind === "physical") return "实物";
  if (kind === "points") return "积分";
  if (kind === "coupon") return "优惠券";
  if (kind === "thanks") return "谢谢参与";
  return kind || "—";
}
function stockText(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "不限";
  return String(v);
}
function claimText(row) {
  if (row.level === 9 || row.prizeKind === "thanks") return "—";
  return row.claimed ? "已领" : "待领";
}

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
    viewPrizes.value = data.prizes || [];
    viewAssigns.value = data.assigns || [];
    viewMeta.value = {
      configured: !!data.configured,
      enabled: !!data.enabled,
      drawMode: data.drawMode || "",
      title: data.title || "",
      note: data.note || "",
    };
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

<style>
.lottery-view-dialog .el-dialog__body {
  max-height: 72vh;
  overflow: auto;
}
</style>
