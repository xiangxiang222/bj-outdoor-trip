<template>
  <div>
    <div class="row">
      <h2>优惠券</h2>
      <el-button type="success" @click="open">发行优惠券</el-button>
    </div>
    <p class="muted">公开限量领取，或定向发给指定用户/会员并短信带短链。库存在领取或发放时扣减；报名成功才核销。与会员 95 折取更低，不叠加。公司团不可用。</p>
    <el-table :data="list" stripe>
      <el-table-column prop="code" label="口令" width="110" />
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column label="行程" min-width="180">
        <template #default="{ row }">{{ row.routeTitle }} {{ row.startDate }}</template>
      </el-table-column>
      <el-table-column prop="label" label="优惠" width="90" />
      <el-table-column label="对象" width="90">
        <template #default="{ row }">{{ audienceText(row.audience) }}</template>
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

    <el-dialog v-model="showCreate" title="发行优惠券" width="520px">
      <el-form label-width="110px">
        <el-form-item label="行程">
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
      <p class="muted" v-if="grantRow">{{ grantRow.name }} · 余 {{ grantRow.remain }} 张。每人一张，重复发放会跳过。</p>
      <el-form label-width="100px">
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
  form.value = { scheduleId: preset, kind: "amount", value: 30, fold: 8, capAmount: 50, total: 20, floorPrice: 0, name: "", audience: "public" };
  showCreate.value = true;
}

async function save() {
  saving.value = true;
  try {
    const payload = { ...form.value };
    if (payload.kind === "percent") delete payload.value;
    else delete payload.fold;
    await http.post("/admin/coupons", payload);
    ElMessage.success("已发行");
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
  grantForm.value = { phonesText: "", allMembers: false, sms: true };
  showGrant.value = true;
}

async function saveGrant() {
  granting.value = true;
  try {
    const res = await http.post("/admin/coupons/" + grantRow.value.id + "/grant", grantForm.value);
    ElMessage.success(`已发放 ${res.data.granted} 张` + (res.data.sms ? `，短信 ${res.data.sms} 条` : ""));
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
