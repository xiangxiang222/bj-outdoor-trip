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
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          {{ scheduleStatusText(row.status) }}
          <span v-if="row.reviewStatus === 'pending'" style="color:#c77d3a"> · 待审</span>
          <span v-else-if="row.reviewStatus === 'rejected'" style="color:#bc4749"> · 驳回</span>
        </template>
      </el-table-column>
      <el-table-column label="车型" width="120">
        <template #default="{ row }">{{ row.bus?.name }}</template>
      </el-table-column>
      <el-table-column label="人数" width="130">
        <template #default="{ row }">
          {{ row.enrolled }}/{{ row.maxSeats }}
          <span v-if="row.virtualEnrolled" class="muted"> 虚{{ row.virtualEnrolled }}</span>
          <span v-if="row.waitlistCount" class="muted"> +{{ row.waitlistCount }}候</span>
        </template>
      </el-table-column>
      <el-table-column prop="revenue" label="收入" width="80" />
      <el-table-column prop="cost" label="成本" width="80" />
      <el-table-column prop="profit" label="利润" width="80" />
      <el-table-column label="导游" width="110">
        <template #default="{ row }">
          <el-button v-if="row.guide" link type="primary" @click="openGuide(row)">{{ row.guide.name }}</el-button>
          <span v-else>未匹配</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="520" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.reviewStatus === 'pending'" size="small" type="success" @click="review(row, 'approved')">通过</el-button>
          <el-button v-if="row.reviewStatus === 'pending'" size="small" type="warning" @click="review(row, 'rejected')">驳回</el-button>
          <el-button size="small" @click="cost(row)">成本</el-button>
          <el-button size="small" @click="openTrip(row)">车辆座位</el-button>
          <el-button size="small" :disabled="row.status === 'cancelled'" @click="openVirtual(row)">虚拟</el-button>
          <el-button size="small" @click="demo(row)">画像</el-button>
          <el-button size="small" type="success" :disabled="row.status === 'cancelled'" @click="settle(row)">结算</el-button>
          <el-button size="small" @click="openSplit(row)">分账</el-button>
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
        <el-form-item label="团型">
          <el-select v-model="neu.offerType">
            <el-option label="早鸟团" value="early" />
            <el-option label="特惠团" value="deal" />
            <el-option label="免费团" value="free" />
            <el-option label="全价团" value="full" />
          </el-select>
        </el-form-item>
        <el-form-item label="虚拟报名">
          <el-input-number v-model="neu.virtualCount" :min="0" :max="80" />
          <p class="muted" style="margin:6px 0 0">发布后先占若干看起来像真人的报名，之后仍可在列表里改人数。</p>
        </el-form-item>
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
    <el-dialog v-model="showSplit" title="企业支付分账" width="560px">
      <p class="muted">模拟微信商户号分账：平台抽成 8%，导游按成本或 5%，剩余归开团公司。</p>
      <el-table :data="splitRows" stripe size="small">
        <el-table-column prop="name" label="接收方" />
        <el-table-column prop="party" label="角色" width="90">
          <template #default="{ row }">{{ { platform: "平台", guide: "导游", merchant: "商家" }[row.party] || row.party }}</template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="90" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">{{ row.status === "success" ? "已分账" : "待分账" }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showSplit = false">关闭</el-button>
        <el-button type="success" @click="runSplit">发起/查看分账</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showTrip" title="车辆、锁定座位与调座" width="560px">
      <el-form label-width="110px" v-if="cur">
        <el-form-item label="车牌号"><el-input v-model="tripForm.plateNo" placeholder="确认后填写" /></el-form-item>
        <el-form-item label="本团咨询群"><el-input v-model="tripForm.consultGroup" placeholder="群名或口令" /></el-form-item>
        <el-form-item label="锁定座位">
          <el-input v-model="tripForm.lockedText" placeholder="如 3A,3B 空位可锁给工作人员" />
        </el-form-item>
        <el-form-item label="调换座位">
          <el-select v-model="tripForm.enrollmentId" placeholder="出行人" clearable style="width:180px">
            <el-option v-for="c in chain" :key="c.id" :label="(c.seatNo || '-') + ' ' + c.name" :value="c.id" />
          </el-select>
          <el-input v-model="tripForm.toSeat" placeholder="目标座位 2C" style="width:120px;margin-left:8px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTrip = false">关闭</el-button>
        <el-button type="success" @click="saveTrip">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showVirtual" title="本团虚拟报名" width="480px">
      <p v-if="cur">
        「{{ cur.route?.title }} {{ cur.startDate }}」当前真实 {{ cur.realEnrolled || 0 }} 人、虚拟 {{ cur.virtualEnrolled || 0 }} 人、座位 {{ cur.maxSeats }}。
      </p>
      <p class="muted">用常见姓名、籍贯、手机和紧急联系人占座，前台名单看起来像真人报名。人数可随时改；真人占座时会自动腾出虚拟座位。</p>
      <el-form label-width="120px">
        <el-form-item label="虚拟报名人数">
          <el-input-number v-model="virtualCount" :min="0" :max="80" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showVirtual = false">取消</el-button>
        <el-button type="success" :loading="savingVirtual" @click="saveVirtual">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showGuide" :title="guideDetail?.name || '导游详情'" width="480px">
      <template v-if="guideDetail">
        <p>评分 {{ guideDetail.rating }} · 从业 {{ guideDetail.years }} 年 · 已带团 {{ guideDetail.tripCount }} 次</p>
        <p class="muted">擅长：{{ guideDetail.specialties }}</p>
        <p class="muted" v-if="guideDetail.languages">语言：{{ guideDetail.languages }}</p>
        <p>{{ guideDetail.bio }}</p>
        <p class="muted" v-if="guideDetail.upcoming?.length">近期：{{ guideDetail.upcoming.map((s) => s.startDate + " " + s.title).join("；") }}</p>
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
const showSplit = ref(false);
const showGuide = ref(false);
const showTrip = ref(false);
const showVirtual = ref(false);
const virtualCount = ref(0);
const savingVirtual = ref(false);
const tripForm = ref({ plateNo: "", consultGroup: "", lockedText: "", enrollmentId: null, toSeat: "" });
const chain = ref([]);
const guideDetail = ref(null);
const splitRows = ref([]);
const splitScheduleId = ref(0);
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
  offerType: "full",
  virtualCount: 0,
});

async function openGuide(row) {
  if (!row.guide?.id) return;
  try {
    guideDetail.value = (await http.get("/guides/" + row.guide.id)).data;
    showGuide.value = true;
  } catch (e) {
    ElMessage.error(e.message || "导游详情加载失败");
  }
}
async function load() {
  list.value = (await http.get("/admin/schedules")).data;
  routes.value = (await http.get("/admin/routes")).data;
  buses.value = (await http.get("/buses")).data;
}
onMounted(load);
const activeCount = computed(() => list.value.filter((s) => s.status !== "cancelled").length);
function open() { showNew.value = true; }
function openVirtual(row) {
  cur.value = row;
  virtualCount.value = Number(row.virtualEnrolled || 0);
  showVirtual.value = true;
}
async function saveVirtual() {
  savingVirtual.value = true;
  try {
    const res = await http.post(`/admin/schedules/${cur.value.id}/virtual-users`, { count: virtualCount.value });
    showVirtual.value = false;
    ElMessage.success(res.message || "已更新虚拟报名");
    await load();
  } catch (e) {
    ElMessage.error(e.message || "设置失败");
  } finally {
    savingVirtual.value = false;
  }
}
function cost(row) { cur.value = JSON.parse(JSON.stringify(row)); showCost.value = true; }
async function openTrip(row) {
  cur.value = row;
  tripForm.value = {
    plateNo: row.bus?.plateNo || "",
    consultGroup: row.consultGroup || "",
    lockedText: "",
    enrollmentId: null,
    toSeat: "",
  };
  try {
    const seats = (await http.get(`/schedules/${row.id}/seats`)).data;
    tripForm.value.lockedText = (seats.lockedSeats || []).join(",");
  } catch {
    tripForm.value.lockedText = "";
  }
  try {
    chain.value = ((await http.get("/schedules/" + row.id)).data.chain || []).filter((c) => !c.waitlisted);
  } catch {
    chain.value = [];
  }
  showTrip.value = true;
}
async function saveTrip() {
  try {
    await http.put(`/admin/schedules/${cur.value.id}/trip`, {
      plateNo: tripForm.value.plateNo,
      consultGroup: tripForm.value.consultGroup,
    });
    const lockedSeats = String(tripForm.value.lockedText || "")
      .split(/[,，\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    await http.post(`/admin/schedules/${cur.value.id}/seats/lock`, { lockedSeats });
    if (tripForm.value.enrollmentId && tripForm.value.toSeat) {
      await http.post(`/admin/schedules/${cur.value.id}/seats/assign`, {
        enrollmentId: tripForm.value.enrollmentId,
        seatNo: tripForm.value.toSeat,
      });
    }
    showTrip.value = false;
    ElMessage.success("行程车辆与座位已更新");
    load();
  } catch (e) {
    ElMessage.error(e.message || "保存失败");
  }
}
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
  if (res.data.splits?.length) {
    splitRows.value = res.data.splits;
    splitScheduleId.value = row.id;
    showSplit.value = true;
  }
}
async function openSplit(row) {
  splitScheduleId.value = row.id;
  try {
    splitRows.value = (await http.get(`/admin/schedules/${row.id}/splits`)).data;
  } catch {
    splitRows.value = [];
  }
  showSplit.value = true;
}
async function runSplit() {
  try {
    const res = await http.post(`/admin/schedules/${splitScheduleId.value}/split`);
    splitRows.value = res.data.splits;
    ElMessage.success(res.data.reused ? "已有分账记录" : "已模拟分账到账");
  } catch (e) {
    ElMessage.error(e.message || "分账失败");
  }
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
async function review(row, status) {
  await http.post(`/admin/schedules/${row.id}/review`, { status });
  ElMessage.success(status === "approved" ? "已通过" : "已驳回");
  load();
}
async function create() {
  const res = await http.post("/admin/schedules", neu.value);
  showNew.value = false;
  neu.value.virtualCount = 0;
  ElMessage.success(res.message || "已发布拼团");
  load();
}
</script>
