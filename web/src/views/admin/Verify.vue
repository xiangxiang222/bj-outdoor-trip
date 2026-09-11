<template>
  <div>
    <div class="row">
      <h2>认证审批</h2>
      <el-radio-group class="admin-verify-filter" size="small" :model-value="kind || 'all'" @change="setKind">
        <el-radio-button label="all">全部待审</el-radio-button>
        <el-radio-button label="campus">校园</el-radio-button>
        <el-radio-button label="group">团体</el-radio-button>
      </el-radio-group>
    </div>
    <p class="admin-scroll-hint">消息点进来会高亮对应申请。通过或拒绝后这条待办会消失。</p>
    <el-table :data="items" stripe row-key="key" :row-class-name="rowClass">
      <el-table-column label="类型" width="110">
        <template #default="{ row }">{{ row.kind === "group" ? "团体" : row.user.campusKind === "alumni" ? "校友" : "师生" }}</template>
      </el-table-column>
      <el-table-column label="申请人" min-width="120">
        <template #default="{ row }">{{ row.user.nickname }}</template>
      </el-table-column>
      <el-table-column label="手机" width="130">
        <template #default="{ row }">{{ row.user.phone }}</template>
      </el-table-column>
      <el-table-column label="申请内容" min-width="220">
        <template #default="{ row }">{{ row.kind === "group" ? row.user.groupName || "团体认证" : row.user.school || "校园认证" }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button size="small" type="success" @click="decide(row, 'approve')">通过</el-button>
          <el-button size="small" type="danger" @click="decide(row, 'reject')">拒绝</el-button>
        </template>
      </el-table-column>
    </el-table>
    <p v-if="!items.length" class="muted" style="margin-top:16px">暂无待审认证</p>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import http from "@/api/http";

const route = useRoute();
const router = useRouter();
const items = ref([]);
const kind = ref("");
const focusId = ref("");

onMounted(syncFromRoute);
watch(() => [route.query.kind, route.query.userId], syncFromRoute);

function syncFromRoute() {
  const next = String(route.query.kind || "");
  kind.value = next === "campus" || next === "group" ? next : "";
  focusId.value = String(route.query.userId || "");
  load();
}

function setKind(value) {
  const next = value === "campus" || value === "group" ? value : "";
  router.replace({ path: "/admin/verify", query: next ? { kind: next } : {} });
}

function rowClass({ row }) {
  if (focusId.value && String(row.user.id) === focusId.value) return "admin-row-focus";
  return "";
}

function toItems(users, filter) {
  const rows = [];
  for (const user of users || []) {
    if ((!filter || filter === "campus") && user.studentStatus === "pending") {
      rows.push({ key: `campus-${user.id}`, kind: "campus", user });
    }
    if ((!filter || filter === "group") && user.groupStatus === "pending") {
      rows.push({ key: `group-${user.id}`, kind: "group", user });
    }
  }
  return rows;
}

async function load() {
  const pending = kind.value || "any";
  let users = (await http.get("/admin/users", { params: { pending } })).data || [];
  if (focusId.value && !users.some((u) => String(u.id) === focusId.value)) {
    users = (await http.get("/admin/users", { params: { q: "" } })).data || [];
  }
  items.value = toItems(users, kind.value);
  await nextTick();
  if (!focusId.value) return;
  const el = document.querySelector(".admin-row-focus");
  if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
}

async function decide(row, action) {
  const apiKind = row.kind === "group" ? "group" : "student";
  const label = row.kind === "group" ? "团体认证" : "校园认证";
  try {
    if (action === "reject") {
      await ElMessageBox.confirm(`拒绝「${row.user.nickname}」的${label}？`, "拒绝认证", { type: "warning" });
    }
    await http.post(`/admin/users/${row.user.id}/verify`, { kind: apiKind, action });
    ElMessage.success(action === "approve" ? `${label}已通过` : `${label}已拒绝`);
    window.dispatchEvent(new Event("admin-notices-refresh"));
    await load();
  } catch (e) {
    if (e !== "cancel") ElMessage.error(e.message || "已取消");
  }
}
</script>
