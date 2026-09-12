<template>
  <div>
    <div v-if="selectedIds.length" class="people-picked">
      <el-tag v-for="id in selectedIds" :key="id" closable @close="remove(id)">{{ labelOf(id) }}</el-tag>
    </div>
    <el-button size="small" @click="open">{{ buttonText }}{{ selectedIds.length ? `（已选 ${selectedIds.length}）` : "" }}</el-button>
    <p v-if="hint" class="muted" style="margin:6px 0 0">{{ hint }}</p>

    <el-dialog v-model="visible" title="从名单选人" width="720px" append-to-body align-center @closed="onClosed">
      <div class="row" style="margin-bottom:12px;gap:12px;flex-wrap:wrap">
        <el-input
          v-model="q"
          clearable
          placeholder="搜昵称、手机或学校"
          style="width:220px"
          @clear="reloadFirst"
          @input="onQuery"
        />
        <el-select
          v-model="school"
          clearable
          filterable
          placeholder="高校名单"
          style="width:200px"
          @change="onSchool"
        >
          <el-option v-for="s in schools" :key="s.name" :label="`${s.name}（${s.count}人）`" :value="s.name" />
        </el-select>
        <el-checkbox v-model="membersOnly" @change="reloadFirst">只看会员</el-checkbox>
        <el-checkbox v-model="campusOnly" @change="reloadFirst">只看已认证师生</el-checkbox>
        <el-button size="small" :disabled="!school || loading" @click="pickWholeSchool">全选该校</el-button>
        <span class="muted">已选 {{ picked.size }} 人，翻页不会丢。</span>
      </div>
      <el-table
        ref="tableRef"
        :data="list"
        stripe
        row-key="id"
        max-height="360"
        v-loading="loading"
        @selection-change="onSelect"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="nickname" label="用户" min-width="110" />
        <el-table-column prop="phone" label="手机" width="130" />
        <el-table-column prop="school" label="学校" min-width="120" />
        <el-table-column label="身份" width="90">
          <template #default="{ row }">{{ campusText(row) }}</template>
        </el-table-column>
        <el-table-column label="会员" width="70">
          <template #default="{ row }">{{ row.isMember ? "是" : "—" }}</template>
        </el-table-column>
      </el-table>
      <div class="row" style="margin-top:12px;justify-content:flex-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          small
          @current-change="load"
          @size-change="reloadFirst"
        />
      </div>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="success" @click="confirm">确定（{{ picked.size }} 人）</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, reactive, ref } from "vue";
import http from "@/api/http";

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  hint: { type: String, default: "" },
  buttonText: { type: String, default: "从名单选" },
});
const emit = defineEmits(["update:modelValue"]);
const selectedIds = computed(() => props.modelValue || []);

const visible = ref(false);
const loading = ref(false);
const q = ref("");
const membersOnly = ref(false);
const campusOnly = ref(false);
const school = ref("");
const schools = ref([]);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const list = ref([]);
const tableRef = ref(null);
const known = reactive(new Map());
const picked = reactive(new Map());
const restoring = ref(false);
let timer = 0;

function peopleLabel(u) {
  if (!u) return "用户";
  const bits = [u.nickname || "用户", u.phone || "", u.school || ""];
  if (u.isAlumni) bits.push("校友");
  else if (u.isStudent) bits.push("师生");
  if (u.isMember) bits.push("会员");
  return bits.filter(Boolean).join(" ");
}

function campusText(row) {
  if (row?.isAlumni) return "校友";
  if (row?.isStudent) return "师生";
  return "—";
}

function labelOf(id) {
  return peopleLabel(known.get(id) || picked.get(id) || { id });
}

function remember(rows) {
  for (const u of rows || []) {
    known.set(u.id, u);
    if (picked.has(u.id)) picked.set(u.id, u);
  }
}

async function hydrate(ids) {
  const need = (ids || []).filter((id) => !known.has(id));
  if (!need.length) return;
  try {
    const data = (await http.get("/admin/coupons/people", { params: { ids: need.join(",") } })).data || {};
    remember(data.list || []);
  } catch {
    /* keep placeholders */
  }
}

async function restoreSelection() {
  restoring.value = true;
  await nextTick();
  const table = tableRef.value;
  if (table) {
    table.clearSelection();
    for (const row of list.value) {
      if (picked.has(row.id)) table.toggleRowSelection(row, true);
    }
  }
  await nextTick();
  restoring.value = false;
}

async function load() {
  loading.value = true;
  try {
    const data = (await http.get("/admin/coupons/people", {
      params: {
        q: q.value || "",
        page: page.value,
        pageSize: pageSize.value,
        members: membersOnly.value ? 1 : 0,
        campus: campusOnly.value || school.value ? 1 : 0,
        school: school.value || "",
      },
    })).data || {};
    list.value = data.list || [];
    total.value = Number(data.total || 0);
    if (Array.isArray(data.schools)) schools.value = data.schools;
    remember(list.value);
    await restoreSelection();
  } catch {
    list.value = [];
  } finally {
    loading.value = false;
  }
}

function reloadFirst() {
  page.value = 1;
  load();
}

function onSchool() {
  if (school.value) campusOnly.value = true;
  reloadFirst();
}

async function pickWholeSchool() {
  if (!school.value) return;
  loading.value = true;
  try {
    const data = (await http.get("/admin/coupons/people", {
      params: { school: school.value, campus: 1, all: 1 },
    })).data || {};
    remember(data.list || []);
    for (const u of data.list || []) picked.set(u.id, u);
    await restoreSelection();
  } finally {
    loading.value = false;
  }
}

function onQuery() {
  clearTimeout(timer);
  timer = window.setTimeout(reloadFirst, 300);
}

function onSelect(rows) {
  if (restoring.value) return;
  const pageIds = new Set(list.value.map((u) => u.id));
  for (const id of pageIds) picked.delete(id);
  for (const u of rows || []) picked.set(u.id, u);
}

async function open() {
  picked.clear();
  for (const id of selectedIds.value) {
    picked.set(id, known.get(id) || { id, nickname: "用户", phone: "" });
  }
  q.value = "";
  membersOnly.value = false;
  campusOnly.value = false;
  school.value = "";
  page.value = 1;
  pageSize.value = 20;
  visible.value = true;
  await hydrate(selectedIds.value);
  await load();
}

function confirm() {
  const ids = [...picked.keys()];
  remember([...picked.values()]);
  emit("update:modelValue", ids);
  visible.value = false;
}

function remove(id) {
  emit(
    "update:modelValue",
    selectedIds.value.filter((x) => x !== id)
  );
  picked.delete(id);
}

function onClosed() {
  restoring.value = false;
}

if (selectedIds.value.length) hydrate(selectedIds.value);
</script>

<style scoped>
.people-picked {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
</style>
