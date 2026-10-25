<template>
  <div>
    <p class="muted">成团后系统会按线路类型匹配导游。也可以先了解领队风格再报名。</p>
    <div class="card" v-for="g in list" :key="g.id" @click="$router.push('/m/guide/' + g.id)">
      <div class="pad guide-row">
        <div class="guide-face">
          <img v-if="g.avatar" :src="g.avatar" :alt="g.name" />
          <span v-else>{{ (g.name || "导").slice(0, 1) }}</span>
        </div>
        <div>
          <div class="row">
            <strong>{{ g.name }}</strong>
            <span class="muted">{{ g.rating }} 分 · {{ g.years }}年</span>
          </div>
          <p class="muted" style="margin:4px 0 0">{{ g.specialties }}</p>
          <p style="margin:8px 0 0;font-size: calc(13px * var(--ui-scale))">{{ g.bio }}</p>
        </div>
      </div>
    </div>
    <LoadRow v-if="loading" />
    <p class="muted" v-else-if="!list.length">暂无在岗导游。</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import http from "@/api/http";
import LoadRow from "@/components/LoadRow.vue";

const list = ref([]);
const loading = ref(true);
onMounted(async () => {
  try {
    list.value = (await http.get("/guides")).data || [];
  } finally {
    loading.value = false;
  }
});
</script>
