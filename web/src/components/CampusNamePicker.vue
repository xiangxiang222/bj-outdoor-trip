<template>
  <div class="campus-name-picker">
    <button class="input campus-pick-btn" type="button" :disabled="disabled" @click="open">
      <span v-if="label">{{ label }}</span>
      <span v-else class="muted">{{ placeholder }}</span>
    </button>
    <Teleport to=".mp-phone">
      <div v-if="show" class="campus-sheet-mask" @click.self="close">
        <div class="campus-sheet" role="dialog">
          <div class="campus-sheet-head">
            <strong>{{ title }}</strong>
            <button type="button" class="campus-sheet-x" @click="close">关闭</button>
          </div>
          <input class="input" v-model="q" :placeholder="searchPlaceholder" @input="onSearch" />
          <p class="muted campus-sheet-hint">可留空。搜不到时点「使用该名称」即可自己填。</p>
          <div class="campus-sheet-list">
            <button v-if="custom" type="button" class="campus-sheet-row custom" @click="pick(custom)">使用「{{ custom }}」</button>
            <button
              v-for="row in list"
              :key="row.name"
              type="button"
              class="campus-sheet-row"
              :class="{ on: picked.includes(row.name) }"
              @click="toggle(row.name)"
            >{{ row.name }}</button>
            <p v-if="!loading && !list.length && !custom" class="muted">{{ emptyHint }}</p>
          </div>
          <div class="campus-sheet-foot">
            <button type="button" class="btn ghost" :disabled="page <= 1 || loading" @click="go(page - 1)">上一页</button>
            <span class="muted">{{ page }}/{{ pages }}</span>
            <button type="button" class="btn ghost" :disabled="page >= pages || loading" @click="go(page + 1)">下一页</button>
            <button type="button" class="btn ghost" @click="clear">不选</button>
            <button v-if="multiple" type="button" class="btn" @click="confirm">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import http from "@/api/http";
import { campusPickLabel, joinCampusNames, splitCampusNames } from "@/utils/campusNames";

const props = defineProps({
  modelValue: { type: [String, Array], default: "" },
  kind: { type: String, default: "school" },
  school: { type: String, default: "" },
  college: { type: String, default: "" },
  multiple: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: "可选，搜索后选择" },
  title: { type: String, default: "选择" },
});
const emit = defineEmits(["update:modelValue"]);

const show = ref(false);
const q = ref("");
const list = ref([]);
const custom = ref("");
const page = ref(1);
const total = ref(0);
const pageSize = 20;
const loading = ref(false);
const picked = ref([]);
let timer = 0;

const pages = computed(() => Math.max(1, Math.ceil((total.value || 0) / pageSize)));
const label = computed(() => campusPickLabel(props.modelValue, ""));
const searchPlaceholder = computed(() => {
  if (props.kind === "college") return "搜索学院";
  if (props.kind === "major") return "搜索专业";
  return "搜索学校";
});
const emptyHint = computed(() => {
  if (props.kind === "college" && !String(props.school || "").trim()) return "请先选择学校，学院按学校列出";
  if (props.kind === "major" && !String(props.college || "").trim()) return "请先选择学院，专业按学院列出";
  return "没有匹配项";
});
function parentParam(value) {
  return Array.isArray(value) ? joinCampusNames(value) : String(value || "");
}

watch(
  () => [props.school, props.college, props.kind],
  () => {
    if (show.value) load(1);
  }
);

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

function open() {
  if (props.disabled) return;
  picked.value = splitCampusNames(props.modelValue);
  q.value = "";
  show.value = true;
  load(1);
}

function close() {
  show.value = false;
}

function onSearch() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => load(1), 200);
}

async function load(nextPage) {
  loading.value = true;
  page.value = nextPage;
  try {
    const res = await http.get("/campuses", {
      params: {
        kind: props.kind,
        q: q.value,
        school: parentParam(props.school),
        college: parentParam(props.college),
        page: nextPage,
        pageSize,
      },
    });
    const data = res.data || {};
    list.value = data.list || [];
    total.value = Number(data.total || 0);
    page.value = Number(data.page || nextPage);
    custom.value = data.custom || "";
  } catch {
    list.value = [];
    total.value = 0;
    custom.value = q.value.trim().length >= 2 ? q.value.trim() : "";
  } finally {
    loading.value = false;
  }
}

function go(next) {
  if (next < 1 || next > pages.value) return;
  load(next);
}

function emitValue(names) {
  const next = props.multiple ? joinCampusNames(names) : names[0] || "";
  emit("update:modelValue", Array.isArray(props.modelValue) ? splitCampusNames(next) : next);
}

function toggle(name) {
  if (props.multiple) {
    const set = new Set(picked.value);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    picked.value = [...set];
    return;
  }
  emitValue([name]);
  close();
}

function pick(name) {
  toggle(name);
  if (props.multiple) confirm();
}

function clear() {
  emitValue([]);
  close();
}

function confirm() {
  emitValue(picked.value);
  close();
}
</script>

<style scoped>
.campus-pick-btn {
  display: block;
  width: 100%;
  text-align: left;
  cursor: pointer;
}
.campus-pick-btn:disabled { opacity: .55; cursor: default; }
</style>
<style>
.campus-sheet-mask {
  position: absolute;
  inset: 0;
  z-index: 120;
  background: rgba(0,0,0,.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.campus-sheet {
  width: 100%;
  max-height: 82%;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 16px 16px 20px;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
}
.campus-sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.campus-sheet-x {
  border: 0;
  background: transparent;
  color: #6b705c;
  cursor: pointer;
}
.campus-sheet-hint { margin: 0 0 8px; font-size: calc(12px * var(--ui-scale)); }
.campus-sheet-list {
  overflow: auto;
  min-height: 180px;
  flex: 1;
}
.campus-sheet-row {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 12px 4px;
  border-bottom: 1px dashed #eceee8;
  cursor: pointer;
  font-size: calc(15px * var(--ui-scale));
}
.campus-sheet-row.on { font-weight: 700; color: #1b4332; }
.campus-sheet-row.custom { color: #2d6a4f; }
.campus-sheet-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.campus-sheet-foot .btn { margin: 0; padding: 8px 12px; }
</style>
