<template>
  <div>
    <div class="row">
      <h2>拼团排期、成本与解散</h2>
      <div>
        <el-button type="danger" plain :disabled="!activeCount" @click="openDissolveAll">解散全部拼团（{{ activeCount }}）</el-button>
        <el-button type="success" @click="open">发布拼团</el-button>
      </div>
    </div>
    <el-table :data="list" stripe>
      <el-table-column prop="route.title" label="线路" min-width="160" />
      <el-table-column prop="startDate" label="出发" width="120" />
      <el-table-column label="组织" width="90">
        <template #default="{ row }">{{ organizerTypeText(row.organizerType, true) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">{{ scheduleStatusText(row.status) }}</template>
      </el-table-column>
      <el-table-column label="车型" width="120">
        <template #default="{ row }">{{ row.bus?.name }}</template>
      </el-table-column>
      <el-table-column label="人数" width="110">
        <template #default="{ row }">{{ row.enrolled }}/{{ row.maxSeats }}<span v-if="row.waitlistCount" class="muted"> +{{ row.waitlistCount }}候</span></template>
      </el-table-column>
      <el-table-column prop="revenue" label="收入" width="80" />
      <el-table-column prop="cost" label="成本" width="80" />
      <el-table-column prop="profit" label="利润" width="80" />
      <el-table-column label="导游" width="90">
        <template #default="{ row }">{{ row.guide?.name || "未匹配" }}</template>
      </el-table-column>
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="cost(row)">成本</el-button>
          <el-button size="small" @click="demo(row)">画像</el-button>
          <el-button size="small" type="success" :disabled="row.status === 'cancelled'" @click="settle(row)">结算</el-button>
          <el-button size="small" type="danger" :disabled="row.status === 'cancelled'" @click="openDissolve(row)">解散</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showCost" title="活动成本" width="480px">
      <el-form label-width="90px" v-if="cur">
        <el-form-item label="大巴"><el-input-number v-model="cur.costBreakdown.transport" /></el-form-item>
        <el-form-item label="门票"><el-input-number v-model="cur.costBreakdown.ticket" /></el-form-item>
        <el-form-item label="住宿"><el-input-number v-model="cur.costBreakdown.hotel" /></el-form-item>
        <el-form-item label="餐食"><el-input-number v-model="cur.costBreakdown.meal" /></el-form-item>
        <el-form-item label="导游"><el-input-number v-model="cur.costBreakdown.guide" /></el-form-item>
        <el-form-item label="其他"><el-input-number v-model="cur.costBreakdown.other" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button type="success" @click="saveCost">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDemo" title="本团画像" width="720px">
      <div ref="g1" style="height:220px"></div>
      <div ref="g2" style="height:220px"></div>
      <div ref="g3" style="height:260px"></div>
    </el-dialog>

    <el-dialog v-model="showNew" title="发布拼团" width="520px">
      <el-form label-width="100px">
        <el-form-item label="线路">
          <el-select v-model="neu.routeId" filterable>
            <el-option v-for="r in routes" :key="r.id" :label="r.title" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期"><el-input v-model="neu.startDate" type="date" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="neu.organizerType">
            <el-option label="个人开团" value="individual" />
            <el-option label="公司开团" value="company" />
          </el-select>
        </el-form-item>
        <el-form-item label="公司名"><el-input v-model="neu.companyName" /></el-form-item>
        <el-form-item label="车型">
          <el-select v-model="neu.busTypeId">
            <el-option v-for="b in buses" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="成团人数"><el-input-number v-model="neu.minGroupSize" /></el-form-item>
        <el-form-item label="集合点">
          <el-select v-model="neu.meetupPoint" allow-create filterable>
            <el-option v-for="p in meetupPoints" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="集合时间"><el-input v-model="neu.meetupTime" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="neu.notes" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button type="success" @click="create">发布</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDissolve" :title="dissolveAll ? '解散全部拼团' : '解散拼团'" width="480px">
      <p v-if="dissolveAll">将解散当前全部 {{ activeCount }} 个进行中的拼团（含用户开团），取消报名、已付款标记退款，并向出行人发送取消短信。</p>
      <p v-else-if="cur">解散「{{ cur.route?.title }} {{ cur.startDate }}」后，将取消全部报名、已付款标记退款，并向出行人发送取消短信。</p>
      <el-input v-model="dissolveReason" type="textarea" :rows="3" placeholder="请填写解散理由，会写进短信发给报名用户" />
      <template #footer>
        <el-button @click="showDissolve = false">取消</el-button>
        <el-button type="danger" :loading="dissolving" @click="dissolve">确认解散并通知</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import * as echarts from "echarts";
import { ElMessage } from "element-plus";
import { organizerTypeText, scheduleStatusText } from "@/utils/labels";
import http from "@/api/http";

const meetupPoints = ["东直门东方银座C口", "西直门凯德mall北门外", "国贸桥下大巴停靠点", "丽泽桥西南角"];
const list = ref([]);
const routes = ref([]);
const buses = ref([]);
const showCost = ref(false);
const showDemo = ref(false);
const showNew = ref(false);
const showDissolve = ref(false);
const dissolveAll = ref(false);
const dissolving = ref(false);
const dissolveReason = ref("");
const cur = ref(null);
const g1 = ref();
const g2 = ref();
const g3 = ref();
const neu = ref({
  organizerType: "individual",
  minGroupSize: 10,
  busTypeId: "bus30",
  meetupPoint: "东直门东方银座C口",
  meetupTime: "07:30",
  notes: "",
  companyName: "",
});

async function load() {
  list.value = (await http.get("/admin/schedules")).data;
  routes.value = (await http.get("/admin/routes")).data;
  buses.value = (await http.get("/buses")).data;
}
onMounted(load);
const activeCount = computed(() => list.value.filter((s) => s.status !== "cancelled").length);
function open() { showNew.value = true; }
function cost(row) { cur.value = JSON.parse(JSON.stringify(row)); showCost.value = true; }
async function saveCost() {
  await http.put(`/admin/schedules/${cur.value.id}/cost`, cur.value.costBreakdown);
  showCost.value = false;
  ElMessage.success("成本已更新");
  load();
}
async function settle(row) {
  const res = await http.post(`/admin/schedules/${row.id}/settle`);
  ElMessage.success(`已结算 ${res.data.count} 人`);
  load();
}
function openDissolve(row) {
  cur.value = row;
  dissolveAll.value = false;
  dissolveReason.value = "";
  showDissolve.value = true;
}
function openDissolveAll() {
  cur.value = null;
  dissolveAll.value = true;
  dissolveReason.value = "";
  showDissolve.value = true;
}
async function dissolve() {
  if (!dissolveReason.value.trim()) {
    ElMessage.warning("请填写解散理由");
    return;
  }
  dissolving.value = true;
  try {
    const url = dissolveAll.value ? "/admin/schedules/dissolve-all" : `/admin/schedules/${cur.value.id}/dissolve`;
    const res = await http.post(url, { reason: dissolveReason.value.trim() });
    showDissolve.value = false;
    if (dissolveAll.value) {
      ElMessage.success(`已解散 ${res.data.count} 个拼团：取消 ${res.data.cancelled} 人，退款 ${res.data.refunded} 人，短信 ${res.data.smsCount} 条`);
    } else {
      ElMessage.success(`已解散：取消 ${res.data.cancelled} 人，退款 ${res.data.refunded} 人，短信 ${res.data.smsCount} 条`);
    }
    load();
  } finally {
    dissolving.value = false;
  }
}
async function demo(row) {
  showDemo.value = true;
  const d = (await http.get(`/admin/schedules/${row.id}/demographics`)).data;
  await nextTick();
  echarts.init(g1.value).setOption({ title: { text: "性别" }, series: [{ type: "pie", data: d.gender }] });
  echarts.init(g2.value).setOption({ title: { text: "年龄" }, series: [{ type: "pie", data: d.age.filter((x) => x.value) }] });
  echarts.init(g3.value).setOption({
    title: { text: "籍贯" },
    xAxis: { type: "category", data: d.hometown.map((x) => x.name), axisLabel: { rotate: 30 } },
    yAxis: {},
    series: [{ type: "bar", data: d.hometown.map((x) => x.value) }],
  });
}
async function create() {
  await http.post("/admin/schedules", neu.value);
  showNew.value = false;
  ElMessage.success("已发布拼团");
  load();
}
</script>
