<template>
  <el-select
    :model-value="picked"
    :multiple="multiple"
    filterable
    remote
    clearable
    collapse-tags
    collapse-tags-tooltip
    reserve-keyword
    :remote-method="onSearch"
    :loading="loading"
    :placeholder="placeholder"
    :disabled="disabled"
    style="width: 100%"
    @update:model-value="onPicked"
    @visible-change="onVisible"
    @clear="onPicked(multiple ? [] : '')"
  >
    <el-option v-if="custom" :label="`使用「${custom}」`" :value="custom" />
    <el-option v-for="row in list" :key="row.name" :label="row.name" :value="row.name" />
    <template #footer>
      <div class="campus-select-pager">
        <el-pagination
          small
          layout="prev, pager, next"
          :page-size="pageSize"
          :current-page="page"
          :total="total"
          @current-change="load"
        />
      </div>
    </template>
  </el-select>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import http from "@/api/http";
import { joinCampusNames, splitCampusNames } from "@/utils/campusNames";

const props = defineProps({
  modelValue: { type: [String, Array], default: "" },
  kind: { type: String, default: "school" },
  school: { type: [String, Array], default: "" },
  college: { type: [String, Array], default: "" },
  multiple: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: "可选，搜索后选择" },
});
const emit = defineEmits(["update:modelValue"]);

const q = ref("");
const list = ref([]);
const custom = ref("");
const page = ref(1);
const total = ref(0);
const pageSize = 20;
const loading = ref(false);
let timer = 0;

const picked = computed(() => {
  const names = splitCampusNames(props.modelValue);
  return props.multiple ? names : names[0] || "";
});

watch(
  () => [props.kind, props.school, props.college],
  () => load(1)
);

function onVisible(open) {
  if (open && !list.value.length) load(1);
}

function onSearch(query) {
  q.value = String(query || "");
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => load(1), 200);
}

async function load(nextPage = 1) {
  loading.value = true;
  page.value = nextPage;
  try {
    const res = await http.get("/campuses", {
      params: {
        kind: props.kind,
        q: q.value,
        school: Array.isArray(props.school) ? joinCampusNames(props.school) : props.school,
        college: Array.isArray(props.college) ? joinCampusNames(props.college) : props.college,
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
    custom.value = "";
  } finally {
    loading.value = false;
  }
}

function onPicked(value) {
  if (props.multiple) {
    emit("update:modelValue", Array.isArray(props.modelValue) ? splitCampusNames(value) : joinCampusNames(value));
    return;
  }
  emit("update:modelValue", value || "");
}

load(1);
</script>

<style scoped>
.campus-select-pager {
  display: flex;
  justify-content: flex-end;
  padding: 4px 0 0;
}
</style>
