<template>
  <div>
    <div class="row">
      <h2>优惠券</h2>
      <el-button type="success" @click="open">发行优惠券</el-button>
    </div>
    <p class="muted">可发指定团或通用券（全部个人拼团）。可按久未参加、出行次数定向，人多过库存时随机抽发。领取后可限时。默认与会员/学生价取低；勾选叠加则先打折再减券。公司团不可用。</p>
    <el-table :data="list" stripe>
      <el-table-column prop="code" label="口令" width="110" />
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column label="行程" min-width="180">
        <template #default="{ row }">{{ row.universal ? "全部团" : `${row.routeTitle || ""} ${row.startDate || ""}` }}</template>
      </el-table-column>
      <el-table-column prop="label" label="优惠" width="90" />
      <el-table-column label="对象" width="90">
        <template #default="{ row }">{{ audienceText(row.audience) }}</template>
      </el-table-column>
      <el-table-column label="条件" min-width="140">
        <template #default="{ row }">{{ ruleText(row) }}</template>
      </el-table-column>
      <el-table-column label="限时" width="90">
        <template #default="{ row }">{{ row.validHours ? row.validHours + "小时" : "不限" }}</template>
      </el-table-column>
      <el-table-column label="叠加" width="90">
        <template #default="{ row }">{{ stackText(row) }}</template>
      </el-table-column>
      <el-table-column label="库存" width="100">
        <template #default="{ row }">{{ row.remain }}/{{ row.total }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">{{ statusText(row.status) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="360">
        <template #default="{ row }">
          <el-button size="small" @click="openShare(row)">链接/二维码</el-button>
          <el-button size="small" type="success" @click="openGrant(row)">发放</el-button>
          <el-button size="small" @click="openLedger(row)">台账</el-button>
          <el-button v-if="row.status === 'on'" size="small" type="warning" @click="setStatus(row, 'paused')">暂停</el-button>
          <el-button v-else-if="row.status === 'paused'" size="small" type="success" @click="setStatus(row, 'on')">恢复</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showCreate" title="发行优惠券" width="580px">
      <el-form label-width="120px">
        <el-form-item label="适用范围">
          <el-radio-group v-model="form.universal">
            <el-radio :label="false">指定行程</el-radio>
            <el-radio :label="true">全部团（通用券）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="!form.universal" label="行程">
          <el-select v-model="form.scheduleId" filterable placeholder="选择个人拼团">
            <el-option v-for="s in trips" :key="s.id" :label="tripLabel(s)" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" placeholder="可选，默认按优惠生成" /></el-form-item>
        <el-form-item label="发给谁">
          <el-radio-group v-model="form.audience">
            <el-radio label="public">公开领取</el-radio>
            <el-radio label="member">仅会员领取</el-radio>
            <el-radio label="directed">定向发放</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.kind">
            <el-radio label="percent">几折</el-radio>
            <el-radio label="amount">直减</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.kind === 'percent'" label="几折">
          <el-input-number v-model="form.fold" :min="1" :max="9.9" :step="0.5" />
          <span class="muted" style="margin-left:8px">8 表示 8 折</span>
        </el-form-item>
        <el-form-item v-if="form.kind === 'percent'" label="最高减">
          <el-input-number v-model="form.capAmount" :min="1" /> 元
        </el-form-item>
        <el-form-item v-else label="减免">
          <el-input-number v-model="form.value" :min="1" /> 元
        </el-form-item>
        <el-form-item label="发行数量"><el-input-number v-model="form.total" :min="1" /></el-form-item>
        <el-form-item label="保底价"><el-input-number v-model="form.floorPrice" :min="0" /> 元，0 为不限</el-form-item>
        <el-form-item label="领取后有效">
          <el-input-number v-model="form.validHours" :min="0" /> 小时
          <span class="muted" style="margin-left:8px">0 为不限时，24 为一天</span>
        </el-form-item>
        <el-form-item label="叠加使用">
          <el-checkbox v-model="form.stackMember">叠加会员价</el-checkbox>
          <el-checkbox v-model="form.stackStudent">叠加学生价</el-checkbox>
        </el-form-item>
        <el-form-item label="久未参加">
          <el-input-number v-model="form.idleMonths" :min="0" /> 个月内没出门
          <span class="muted" style="margin-left:8px">0 为不限</span>
        </el-form-item>
        <el-form-item label="出行次数">
          <el-input-number v-model="form.minTrips" :min="0" /> 次及以上
          <span class="muted" style="margin-left:8px">0 为不限</span>
        </el-form-item>
        <el-form-item>
          <el-button size="small" @click="previewTargets">预览符合人数</el-button>
          <span class="muted" style="margin-left:8px">{{ previewHint }}</span>
        </el-form-item>
        <el-form-item label="发行后发放">
          <el-checkbox v-model="form.grantByRule">按上面条件发给符合的人，人多过库存则随机抽</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="success" :loading="saving" @click="save">发行</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showShare" title="领取链接与二维码" width="420px">
      <div v-if="share" style="text-align:center">
        <img :src="share.qr" alt="领取二维码" style="width:200px;height:200px;background:#fff;border-radius:12px" />
        <p class="muted" style="word-break:break-all">{{ share.shortUrl }}</p>
        <p class="muted" style="word-break:break-all">{{ share.landingUrl }}</p>
        <el-button type="success" @click="copy(share.shortUrl)">复制短链</el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="showGrant" title="定向发放" width="520px">
      <p class="muted" v-if="grantRow">{{ grantRow.name }} · 余 {{ grantRow.remain }} 张。每人一张，重复发放会跳过。{{ ruleText(grantRow) !== "不限" ? "发行条件：" + ruleText(grantRow) + "。" : "" }}</p>
      <el-form label-width="100px">
        <el-form-item label="按条件">
          <el-checkbox v-model="grantForm.byRule">按发行时的久未参加 / 出行次数发放，人多随机抽</el-checkbox>
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="grantForm.phonesText" type="textarea" rows="3" placeholder="已注册手机，逗号或换行分隔" />
        </el-form-item>
        <el-form-item label="全部会员">
          <el-checkbox v-model="grantForm.allMembers">发给当前全部有效会员</el-checkbox>
        </el-form-item>
        <el-form-item label="短信">
          <el-checkbox v-model="grantForm.sms">写入短信记录（演示），每人每天最多 1 条券短信</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGrant = false">取消</el-button>
        <el-button type="success" :loading="granting" @click="saveGrant">发放</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showLedger" title="领取台账" width="640px">
      <el-table :data="holders" stripe max-height="420">
        <el-table-column prop="nickname" label="用户" />
        <el-table-column prop="phone" label="手机" width="130" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">{{ holderStatus(row.status) }}</template>
        </el-table-column>
        <el-table-column prop="code" label="券码" width="120" />
        <el-table-column prop="createdAt" label="领取时间" width="170" />
        <el-table-column prop="expiresAt" label="过期" width="170" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import http from "@/api/http";

const route = useRoute();
const list = ref([]);
const trips = ref([]);
const showCreate = ref(false);
const showShare = ref(false);
const showLedger = ref(false);
const showGrant = ref(false);
const granting = ref(false);
const grantRow = ref(null);
const grantForm = ref({ phonesText: "", allMembers: false, sms: true });
const saving = ref(false);
const share = ref(null);
const holders = ref([]);
const form = ref({});
const preview = ref(null);
const previewHint = ref("");

function audienceText(s) {
  if (s === "member") return "仅会员";
  if (s === "directed") return "定向";
  return "公开";
}
function statusText(s) {
  if (s === "paused") return "暂停";
  if (s === "off") return "停用";
  return "领取中";
}
function holderStatus(s) {
  const map = { unused: "未用", held: "候补占用", used: "已核销", expired: "过期", void: "作废" };
  return map[s] || s;
}
function ruleText(row) {
  const bits = [];
  if (row.idleMonths) bits.push(`${row.idleMonths}个月未出门`);
  if (row.minTrips) bits.push(`${row.minTrips}次及以上`);
  return bits.join(" · ") || "不限";
}
function stackText(row) {
  const bits = [];
  if (row.stackMember) bits.push("会员");
  if (row.stackStudent) bits.push("学生");
  return bits.join("+") || "取低";
}
function tripLabel(s) {
  return `${s.route?.title || ""} ${s.startDate}（余${s.remain}）`;
}

async function load() {
  const q = route.query.scheduleId ? { scheduleId: route.query.scheduleId } : {};
  list.value = (await http.get("/admin/coupons", { params: q })).data;
}

onMounted(async () => {
  await load();
  try {
    const rows = (await http.get("/admin/schedules")).data || [];
    trips.value = rows.filter((s) => s.organizerType !== "company" && s.status !== "cancelled");
  } catch {
    trips.value = [];
  }
});

function open() {
  const preset = route.query.scheduleId ? Number(route.query.scheduleId) : "";
  form.value = {
    scheduleId: preset,
    universal: false,
    kind: "amount",
    value: 30,
    fold: 8,
    capAmount: 50,
    total: 20,
    floorPrice: 0,
    name: "",
    audience: "public",
    validHours: 0,
    idleMonths: 0,
    minTrips: 0,
    stackMember: false,
    stackStudent: false,
    grantByRule: false,
  };
  preview.value = null;
  previewHint.value = "";
  showCreate.value = true;
}

async function previewTargets() {
  try {
    const data = (await http.get("/admin/coupons/targets", {
      params: { idleMonths: form.value.idleMonths || 0, minTrips: form.value.minTrips || 0 },
    })).data;
    preview.value = data;
    if (data.needRule) {
      previewHint.value = "先填久未参加或出行次数";
      return;
    }
    const total = Number(form.value.total || 0);
    previewHint.value =
      data.count > total && total > 0
        ? `${data.count} 人符合，将随机发给 ${total} 人`
        : `${data.count} 人符合`;
  } catch (e) {
    previewHint.value = e.message || "预览失败";
  }
}

async function save() {
  saving.value = true;
  try {
    const payload = { ...form.value };
    if (payload.universal) payload.scheduleId = 0;
    if (payload.kind === "percent") delete payload.value;
    else delete payload.fold;
    const res = await http.post("/admin/coupons", payload);
    ElMessage.success(res.message || (res.data?.granted ? `已发行并发放 ${res.data.granted} 张` : "已发行"));
    showCreate.value = false;
    load();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function setStatus(row, status) {
  try {
    await http.put("/admin/coupons/" + row.id, { status });
    ElMessage.success(status === "paused" ? "已暂停领取" : "已恢复");
    load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function openGrant(row) {
  grantRow.value = row;
  grantForm.value = { phonesText: "", allMembers: false, sms: true, byRule: !!(row.idleMonths || row.minTrips) };
  showGrant.value = true;
}

async function saveGrant() {
  granting.value = true;
  try {
    const res = await http.post("/admin/coupons/" + grantRow.value.id + "/grant", grantForm.value);
    const extra = res.data?.randomized ? `（符合 ${res.data.matched} 人，已随机）` : "";
    ElMessage.success(`已发放 ${res.data.granted} 张${extra}` + (res.data.sms ? `，短信 ${res.data.sms} 条` : ""));
    showGrant.value = false;
    load();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    granting.value = false;
  }
}

async function openShare(row) {
  try {
    const res = (await http.get("/admin/coupons/" + row.id)).data;
    share.value = res.share;
    showShare.value = true;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function openLedger(row) {
  try {
    const res = (await http.get("/admin/coupons/" + row.id)).data;
    holders.value = res.holders || [];
    showLedger.value = true;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success("已复制");
  } catch {
    ElMessage.error("复制失败");
  }
}
</script>
