<template>
  <div>
    <div class="row">
      <h2>用户与会员</h2>
      <div class="row" style="gap:8px">
        <el-input v-model="q" placeholder="手机 / 昵称 / 公司" clearable style="width:240px" @keyup.enter="load" />
        <el-button type="success" @click="load">查询</el-button>
      </div>
    </div>
    <p class="admin-scroll-hint">校园、团体和领队认证请到「认证审批」。这里只管会员、积分和账号。</p>
    <div class="virtual-pool">
      <span>虚拟用户池 {{ pool.total }} 人，空闲 {{ pool.idle }}，正在占座 {{ pool.busy }}。各团从这里抽人，不够会自动补进池。</span>
      <el-input-number v-model="poolCount" :min="1" :max="200" />
      <el-button type="success" :loading="growingPool" @click="growPool">生成虚拟用户</el-button>
    </div>
    <el-table :data="list" stripe row-key="id" :row-class-name="rowClass">
      <el-table-column prop="nickname" label="昵称" min-width="120" />
      <el-table-column prop="phone" label="手机" width="130" />
      <el-table-column label="类型" width="80">
        <template #default="{ row }">{{ row.isVirtual ? "虚拟" : "真实" }}</template>
      </el-table-column>
      <el-table-column label="性别" width="80">
        <template #default="{ row }">{{ genderText(row.gender) }}</template>
      </el-table-column>
      <el-table-column label="会员" width="90">
        <template #default="{ row }">{{ row.isMember ? "有效" : row.is_member ? "已过期" : "否" }}</template>
      </el-table-column>
      <el-table-column prop="member_expire_at" label="到期" width="120" />
      <el-table-column prop="points" label="积分" width="80" />
      <el-table-column prop="company_name" label="公司" min-width="140" />
      <el-table-column label="校园" width="120">
        <template #default="{ row }">{{ row.isAlumni ? "校友" : row.isStudent ? "已认证" : row.studentStatus === "pending" ? "待审" : "—" }}</template>
      </el-table-column>
      <el-table-column label="团体" min-width="120">
        <template #default="{ row }">{{ row.groupStatus === "approved" ? row.groupName || "已认证" : row.groupStatus === "pending" ? "待审" : "—" }}</template>
      </el-table-column>
      <el-table-column label="领队" width="110">
        <template #default="{ row }">{{ row.isLeader ? "已认证" : row.leaderStatus === "pending" ? "待审" : "—" }}</template>
      </el-table-column>
      <el-table-column label="操作" width="420">
        <template #default="{ row }">
          <el-button v-if="row.studentStatus === 'pending'" size="small" @click="verify(row, 'student')">过校园</el-button>
          <el-button v-if="row.groupStatus === 'pending'" size="small" @click="verify(row, 'group')">过团体</el-button>
          <el-button v-if="row.leaderStatus === 'pending'" size="small" @click="verify(row, 'leader')">过领队</el-button>
          <el-button size="small" type="success" @click="grant(row)">{{ row.isMember ? "续费" : "开通" }}</el-button>
          <el-button v-if="row.isMember" size="small" @click="revoke(row)">取消会员</el-button>
          <el-button size="small" @click="openPoints(row)">积分</el-button>
          <el-button size="small" type="danger" @click="close(row)">注销</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showPoints" title="调整积分" width="420px">
      <p class="muted">{{ pointsRow?.nickname }} 当前 {{ pointsRow?.points }} 分</p>
      <el-form label-width="90px">
        <el-form-item label="变动">
          <el-input-number v-model="pointsForm.delta" :step="10" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="pointsForm.reason" placeholder="例如：活动补发 / 客服扣减" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPoints = false">取消</el-button>
        <el-button type="success" :loading="saving" @click="savePoints">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import http from "@/api/http";
import { genderText } from "@/utils/labels";

const route = useRoute();
const router = useRouter();
const list = ref([]);
const q = ref("");
const focusId = ref("");
const showPoints = ref(false);
const saving = ref(false);
const pointsRow = ref(null);
const pointsForm = ref({ delta: 10, reason: "" });
const pool = ref({ total: 0, idle: 0, busy: 0 });
const poolCount = ref(20);
const growingPool = ref(false);

onMounted(syncFromRoute);
watch(() => [route.query.pending, route.query.userId], syncFromRoute);

function syncFromRoute() {
  const pending = String(route.query.pending || "");
  const userId = String(route.query.userId || "");
  if (pending === "campus" || pending === "group" || pending === "leader") {
    router.replace({ path: "/admin/verify", query: { kind: pending, ...(userId ? { userId } : {}) } });
    return;
  }
  focusId.value = userId;
  load();
}

function rowClass({ row }) {
  if (focusId.value && String(row.id) === focusId.value) return "admin-row-focus";
  if (row.studentStatus === "pending" || row.groupStatus === "pending" || row.leaderStatus === "pending") return "admin-row-pending";
  return "";
}

async function load() {
  list.value = (await http.get("/admin/users", { params: { q: q.value } })).data;
  try {
    pool.value = (await http.get("/admin/virtual-users/pool")).data || pool.value;
  } catch {
    /* ignore */
  }
  if (focusId.value && !list.value.some((u) => String(u.id) === focusId.value)) {
    list.value = (await http.get("/admin/users", { params: { q: q.value } })).data;
  }
  await nextTick();
  if (!focusId.value) return;
  const el = document.querySelector(".admin-row-focus");
  if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
}

async function growPool() {
  growingPool.value = true;
  try {
    const res = await http.post("/admin/virtual-users/pool", { count: poolCount.value });
    pool.value = res.data || pool.value;
    ElMessage.success(res.message || "已生成");
    await load();
  } catch (e) {
    ElMessage.error(e.message || "生成失败");
  } finally {
    growingPool.value = false;
  }
}

async function verify(row, kind) {
  try {
    await http.post(`/admin/users/${row.id}/verify`, { kind, action: "approve" });
    ElMessage.success(kind === "student" ? "校园认证已通过" : kind === "leader" ? "领队已通过" : "团体已通过");
    window.dispatchEvent(new Event("admin-notices-refresh"));
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function grant(row) {
  try {
    await ElMessageBox.confirm(`为「${row.nickname}」开通或续费一年会员？`, "开通会员", { type: "warning" });
    await http.post(`/admin/users/${row.id}/member`, { action: "grant" });
    ElMessage.success("已开通/续费会员");
    await load();
  } catch (e) {
    if (e !== "cancel") ElMessage.error(e.message || "已取消");
  }
}

async function revoke(row) {
  try {
    await ElMessageBox.confirm(`取消「${row.nickname}」的会员资格？`, "取消会员", { type: "warning" });
    await http.post(`/admin/users/${row.id}/member`, { action: "revoke" });
    ElMessage.success("已取消会员");
    await load();
  } catch (e) {
    if (e !== "cancel") ElMessage.error(e.message || "已取消");
  }
}

function openPoints(row) {
  pointsRow.value = row;
  pointsForm.value = { delta: 10, reason: "" };
  showPoints.value = true;
}

async function savePoints() {
  saving.value = true;
  try {
    await http.post(`/admin/users/${pointsRow.value.id}/points`, pointsForm.value);
    showPoints.value = false;
    ElMessage.success("积分已调整");
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function close(row) {
  try {
    await ElMessageBox.confirm(`注销「${row.nickname}」后将取消未出行报名，同一手机可再注册。`, "注销用户", { type: "warning" });
    await http.post(`/admin/users/${row.id}/close`);
    ElMessage.success("已注销");
    await load();
  } catch (e) {
    if (e !== "cancel") ElMessage.error(e.message || "已取消");
  }
}
</script>

<style scoped>
.virtual-pool {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
  padding: 10px 12px;
  background: #f6f8fb;
  border-radius: 8px;
  color: #606266;
  font-size: 13px;
}
.virtual-pool span { flex: 1; min-width: 240px; line-height: 1.5; }
</style>
