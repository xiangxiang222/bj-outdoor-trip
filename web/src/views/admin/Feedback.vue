<template>
  <div>
    <div class="row">
      <h2>意见反馈</h2>
      <el-radio-group size="small" :model-value="channel || 'all'" @change="setChannel">
        <el-radio-button label="all">全部</el-radio-button>
        <el-radio-button label="experience">体验问题</el-radio-button>
        <el-radio-button label="complaint">活动、领队投诉</el-radio-button>
      </el-radio-group>
    </div>
    <p class="admin-scroll-hint">用户提交后会出现在右上角消息里，点开定位到这一条。</p>
    <el-table :data="items" stripe row-key="id" :row-class-name="rowClass">
      <el-table-column label="分类" width="140">
        <template #default="{ row }">{{ row.channelLabel }}</template>
      </el-table-column>
      <el-table-column label="类型" width="130">
        <template #default="{ row }">{{ row.label }}</template>
      </el-table-column>
      <el-table-column label="用户" min-width="140">
        <template #default="{ row }">{{ row.nickname || "用户" }}<br />{{ row.phone }}</template>
      </el-table-column>
      <el-table-column label="内容" min-width="240">
        <template #default="{ row }">{{ row.content }}</template>
      </el-table-column>
      <el-table-column label="截图" width="180">
        <template #default="{ row }">
          <el-image
            v-for="url in row.images"
            :key="url"
            :src="url"
            :preview-src-list="row.images"
            fit="cover"
            style="width:48px;height:48px;border-radius:6px;margin-right:6px"
          />
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="时间" width="170" />
    </el-table>
    <p v-if="!items.length" class="muted" style="margin-top:16px">还没有反馈</p>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";

const route = useRoute();
const router = useRouter();
const items = ref([]);
const channel = ref("");
const focusId = ref("");

onMounted(syncFromRoute);
watch(() => [route.query.channel, route.query.id], syncFromRoute);

function syncFromRoute() {
  const next = String(route.query.channel || "");
  channel.value = next === "experience" || next === "complaint" ? next : "";
  focusId.value = String(route.query.id || "");
  load();
}

function setChannel(value) {
  const next = value === "experience" || value === "complaint" ? value : "";
  router.replace({ path: "/admin/feedback", query: next ? { channel: next } : {} });
}

function rowClass({ row }) {
  if (focusId.value && String(row.id) === focusId.value) return "admin-row-focus";
  return "";
}

async function load() {
  const params = channel.value ? { channel: channel.value } : {};
  items.value = (await http.get("/admin/feedbacks", { params })).data || [];
  await nextTick();
  if (!focusId.value) return;
  const el = document.querySelector(".admin-row-focus");
  if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
}
</script>
