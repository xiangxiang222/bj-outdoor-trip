<template>
  <div>
    <div class="row"><h2>偏好与标签</h2><el-button v-if="canOps" type="success" @click="tab === 'preferences' ? openPreference() : open()">{{ tab === 'preferences' ? '新增出游偏好' : '新增发团标签' }}</el-button></div>
    <el-tabs v-model="tab">
      <el-tab-pane label="出游偏好" name="preferences">
        <p class="muted">统一管理用户端线路筛选。常用偏好直接展示，其他偏好在「更多偏好」中展开；排序值越小越靠前。</p>
        <p class="muted">线路分类命中任一配置分类，或线路标签精确命中任一配置标签，即归入该偏好。标题和地区不会参与匹配，一条线路可以同时命中多个偏好。</p>
        <p v-if="preferenceError" class="preference-error" role="alert">{{ preferenceError }} <el-button link type="primary" @click="loadPreferences">重新加载</el-button></p>
        <div v-loading="preferenceLoading" class="admin-load">
          <el-table :data="preferences" stripe row-key="key" :empty-text="preferenceLoading ? ' ' : '暂无出游偏好'" data-testid="route-preference-table">
            <el-table-column label="名称 / 标识" min-width="145"><template #default="{ row }"><strong>{{ row.name }}</strong><div class="muted">{{ row.key }}</div></template></el-table-column>
            <el-table-column label="展示位置" width="100"><template #default="{ row }">{{ row.primary ? '常用' : '更多偏好' }}</template></el-table-column>
            <el-table-column prop="sortOrder" label="排序" width="70" />
            <el-table-column label="匹配分类" min-width="155"><template #default="{ row }"><div class="preference-tags"><el-tag v-for="value in row.categories || []" :key="value" size="small">{{ value }}</el-tag><span v-if="!row.categories?.length" class="muted">—</span></div></template></el-table-column>
            <el-table-column label="匹配标签" min-width="180"><template #default="{ row }"><div class="preference-tags"><el-tag v-for="value in row.tags || []" :key="value" size="small" type="info">{{ value }}</el-tag><span v-if="!row.tags?.length" class="muted">—</span></div></template></el-table-column>
            <el-table-column label="公开线路" width="105"><template #default="{ row }">{{ row.count ?? 0 }} 条</template></el-table-column>
            <el-table-column label="状态" width="85"><template #default="{ row }"><el-tag :type="row.status === 'on' ? 'success' : 'info'" size="small">{{ row.status === 'on' ? '启用' : '已停用' }}</el-tag></template></el-table-column>
            <el-table-column v-if="canOps" label="操作" width="170" fixed="right"><template #default="{ row }"><el-button size="small" @click="editPreference(row)">编辑</el-button><el-button size="small" :type="row.status === 'on' ? 'danger' : 'success'" :loading="changingKey === row.key" @click="togglePreference(row)">{{ row.status === 'on' ? '停用' : '启用' }}</el-button></template></el-table-column>
          </el-table>
        </div>
        <p class="muted">公开线路数量只统计已审核、已上架且可公开浏览的线路。停用后用户端不再展示该偏好，线路本身不会下架。</p>
      </el-tab-pane>
      <el-tab-pane label="发团标签" name="trip-tags">
        <p class="muted">这些标签用于行程和发团时的玩法选择，审核通过后可展示在行程中。线路目录的主筛选由「出游偏好」独立配置。</p>
        <p v-if="tagError" class="preference-error" role="alert">{{ tagError }} <el-button link type="primary" @click="loadTags">重新加载</el-button></p>
        <div v-loading="loading" element-loading-text="加载中…" class="admin-load">
          <el-table :data="list" stripe :empty-text="loading ? ' ' : '暂无标签'">
            <el-table-column label="颜色" width="80"><template #default="{ row }"><span class="dot" :style="{ background: row.color }" /></template></el-table-column>
            <el-table-column prop="name" label="名称" />
            <el-table-column label="配图" width="80"><template #default="{ row }"><el-image v-if="row.cover" :src="row.cover" style="width:40px;height:40px;border-radius:8px" fit="cover" /></template></el-table-column>
            <el-table-column v-if="canOps" label="操作" width="160"><template #default="{ row }"><el-button size="small" @click="edit(row)">编辑</el-button><el-button size="small" type="danger" @click="off(row)">下架</el-button></template></el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="preferenceShow" :title="editingKey ? '编辑出游偏好' : '新增出游偏好'" width="640px" align-center :close-on-click-modal="false" :close-on-press-escape="!savingPreference" :show-close="!savingPreference">
      <el-form label-width="95px" @submit.prevent="savePreference">
        <el-form-item label="稳定标识"><el-input v-model="preferenceForm.key" :disabled="!!editingKey" maxlength="64" placeholder="例如 hiking，可用小写字母、数字、短横线和下划线" /><div class="muted">保存后不可修改，用于保持已有筛选链接有效。</div></el-form-item>
        <el-form-item label="显示名称"><el-input v-model="preferenceForm.name" maxlength="32" placeholder="例如 徒步登山" /></el-form-item>
        <el-form-item label="展示位置"><el-radio-group v-model="preferenceForm.primary"><el-radio :value="true">常用</el-radio><el-radio :value="false">更多偏好</el-radio></el-radio-group></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="preferenceForm.sortOrder" :min="0" :max="1000000" :step="10" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="preferenceForm.status" active-value="on" inactive-value="off" /></el-form-item>
        <el-form-item label="匹配分类"><el-select v-model="preferenceForm.categories" multiple filterable allow-create default-first-option class="preference-select" placeholder="可多选或输入现有线路分类"><el-option v-for="value in categoryOptions" :key="value" :label="value" :value="value" /></el-select></el-form-item>
        <el-form-item label="匹配标签"><el-select v-model="preferenceForm.tags" multiple filterable allow-create default-first-option class="preference-select" placeholder="可多选或输入线路标签"><el-option v-for="value in tagOptions" :key="value" :label="value" :value="value" /></el-select></el-form-item>
        <p class="muted">分类和标签至少填写一项。命中其中任意一个完整值即可，名称相似或包含同一汉字不会算命中。</p>
        <p v-if="preferenceFormError" class="preference-error" role="alert">{{ preferenceFormError }}</p>
      </el-form>
      <template #footer><el-button :disabled="savingPreference" @click="preferenceShow = false">取消</el-button><el-button type="success" :loading="savingPreference" @click="savePreference">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="show" :title="form.id ? '编辑发团标签' : '新增发团标签'" width="480px" align-center :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="颜色"><el-input v-model="form.color" placeholder="#2d6a4f" /></el-form-item>
        <el-form-item label="配图"><el-upload :show-file-list="false" accept="image/*" :http-request="uploadCover"><el-image v-if="form.cover" :src="form.cover" style="width:80px;height:80px" fit="cover" /><el-button v-else>上传</el-button></el-upload></el-form-item>
      </el-form>
      <template #footer><el-button @click="show = false">取消</el-button><el-button type="success" :loading="savingTag" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import http from "@/api/http";
import { COMMON_ROUTE_TAGS, ROUTE_CATEGORIES, mergeOptions } from "@/utils/routeMeta";
import { hasCap } from "@/utils/staff";

const me = ref({ caps: [] });
const canOps = computed(() => hasCap(me.value, "ops"));
const tab = ref("preferences");
const preferences = ref([]);
const preferenceLoading = ref(true);
const preferenceError = ref("");
const preferenceShow = ref(false);
const editingKey = ref("");
const preferenceForm = ref({});
const preferenceFormError = ref("");
const savingPreference = ref(false);
const changingKey = ref("");
const list = ref([]);
const loading = ref(true);
const tagError = ref("");
const show = ref(false);
const savingTag = ref(false);
const form = ref({});
const categoryOptions = computed(() => mergeOptions(ROUTE_CATEGORIES, ...preferences.value.map(item => item.categories || []), preferenceForm.value.categories || []));
const tagOptions = computed(() => mergeOptions(COMMON_ROUTE_TAGS, ...preferences.value.map(item => item.tags || []), preferenceForm.value.tags || []));
let disposed = false;
let preferenceRequestId = 0;
let tagRequestId = 0;
onBeforeUnmount(() => { disposed = true; preferenceRequestId++; tagRequestId++; });

async function loadPreferences() {
  if (disposed) return;
  const requestId = ++preferenceRequestId;
  const current = () => !disposed && requestId === preferenceRequestId;
  preferenceLoading.value = true;
  preferenceError.value = "";
  try {
    const response = await http.get("/admin/route-preferences");
    if (!current()) return;
    if (!Array.isArray(response.data)) throw new Error("偏好配置格式有误");
    preferences.value = response.data;
  } catch (error) { if (current()) preferenceError.value = error.message || "出游偏好加载失败"; }
  finally { if (current()) preferenceLoading.value = false; }
}
async function loadTags() {
  if (disposed) return;
  const requestId = ++tagRequestId;
  const current = () => !disposed && requestId === tagRequestId;
  loading.value = true;
  tagError.value = "";
  try { const response = await http.get("/admin/play-tags"); if (current()) list.value = response.data || []; }
  catch (error) { if (current()) tagError.value = error.message || "发团标签加载失败"; }
  finally { if (current()) loading.value = false; }
}
async function load() {
  try { const response = await http.get("/admin/me"); if (disposed) return; me.value = response.data || { caps: [] }; }
  catch { if (disposed) return; me.value = { caps: [] }; }
  await Promise.allSettled([loadPreferences(), loadTags()]);
}
onMounted(load);

function openPreference() {
  if (!canOps.value) return;
  editingKey.value = "";
  preferenceFormError.value = "";
  preferenceForm.value = { key: "", name: "", primary: false, sortOrder: 100, status: "on", categories: [], tags: [] };
  preferenceShow.value = true;
}
function editPreference(row) {
  if (!canOps.value) return;
  editingKey.value = row.key;
  preferenceFormError.value = "";
  preferenceForm.value = { key: row.key, name: row.name, primary: !!row.primary, sortOrder: row.sortOrder, status: row.status, categories: [...(row.categories || [])], tags: [...(row.tags || [])] };
  preferenceShow.value = true;
}
async function savePreference() {
  if (!canOps.value || savingPreference.value) return;
  const source = preferenceForm.value;
  const payload = { key: String(editingKey.value || source.key || "").trim(), name: String(source.name || "").trim(), primary: !!source.primary, sortOrder: Number(source.sortOrder), status: source.status, categories: mergeOptions([], source.categories || []), tags: mergeOptions([], source.tags || []) };
  preferenceFormError.value = !/^[a-z][a-z0-9_-]{0,63}$/.test(payload.key) ? "标识须以小写字母开头，仅使用小写字母、数字、短横线和下划线，最多 64 位。" : !payload.name || payload.name.length > 32 ? "显示名称须为 1–32 字。" : !payload.categories.length && !payload.tags.length ? "至少选择一个匹配分类或标签。" : !Number.isInteger(payload.sortOrder) || payload.sortOrder < 0 || payload.sortOrder > 1000000 ? "排序须为 0–1000000 的整数。" : "";
  if (preferenceFormError.value) return;
  savingPreference.value = true;
  try {
    if (editingKey.value) await http.put("/admin/route-preferences/" + encodeURIComponent(editingKey.value), payload);
    else await http.post("/admin/route-preferences", payload);
    preferenceShow.value = false;
    ElMessage.success("出游偏好已保存");
    await loadPreferences();
  } catch (error) { preferenceFormError.value = error.message || "保存失败，请重试。"; }
  finally { savingPreference.value = false; }
}
async function togglePreference(row) {
  if (!canOps.value || changingKey.value) return;
  changingKey.value = row.key;
  try {
    if (row.status === "on") await ElMessageBox.confirm(`停用「${row.name}」后，用户端将隐藏该偏好，线路仍会保留。`, "停用出游偏好", { type: "warning", confirmButtonText: "停用", cancelButtonText: "取消" });
    if (row.status === "on") await http.delete("/admin/route-preferences/" + encodeURIComponent(row.key));
    else await http.put("/admin/route-preferences/" + encodeURIComponent(row.key), { status: "on" });
    ElMessage.success(row.status === "on" ? "已停用" : "已启用");
    await loadPreferences();
  } catch (error) { if (error !== "cancel" && error !== "close") ElMessage.error(error.message || "更新失败，请重试。"); }
  finally { changingKey.value = ""; }
}
function open() { if (canOps.value) { form.value = { name: "", color: "", cover: "" }; show.value = true; } }
function edit(row) { if (canOps.value) { form.value = { ...row }; show.value = true; } }
async function uploadCover(opt) {
  if (!canOps.value) return;
  const data = new FormData(); data.append("file", opt.file);
  try { form.value.cover = (await http.post("/admin/upload", data)).data.url; opt.onSuccess?.({}); }
  catch (error) { ElMessage.error(error.message); opt.onError?.(error); }
}
async function save() {
  if (!canOps.value || savingTag.value) return;
  if (!String(form.value.name || "").trim()) { ElMessage.error("请填写标签名称"); return; }
  savingTag.value = true;
  try {
    if (form.value.id) await http.put("/admin/play-tags/" + form.value.id, form.value);
    else await http.post("/admin/play-tags", form.value);
    show.value = false; ElMessage.success("已保存"); await loadTags();
  } catch (error) { ElMessage.error(error.message || "保存失败"); }
  finally { savingTag.value = false; }
}
async function off(row) {
  if (!canOps.value) return;
  try { await http.delete("/admin/play-tags/" + row.id); ElMessage.success("已下架"); await loadTags(); }
  catch (error) { ElMessage.error(error.message || "下架失败"); }
}
</script>

<style scoped>
.dot { display:inline-block; width:18px; height:18px; border-radius:50%; }
.preference-tags { display:flex; flex-wrap:wrap; gap:5px; }
.preference-select { width:100%; }
.preference-error { color:#b73848; font-size:13px; line-height:1.6; }
</style>
