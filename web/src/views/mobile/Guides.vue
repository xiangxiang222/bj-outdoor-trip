<template>
  <div>
    <p class="muted">成团后系统会按线路类型匹配导游。也可以先了解领队风格再报名。</p>
    <div class="card">
      <div class="pad">
        <strong>{{ recruit.copy }}</strong>
        <p class="muted">把推荐码发给想当领队的朋友。首次带队完成后奖励推荐者 {{ recruit.reward }} 元。</p>
        <p v-if="recruit.code">我的推荐码 {{ recruit.code }}</p>
      </div>
    </div>
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
          <p style="margin:8px 0 0;font-size:13px">{{ g.bio }}</p>
        </div>
      </div>
    </div>
    <p class="muted" v-if="!list.length">暂无在岗导游。</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import http from "@/api/http";

const list = ref([]);
const recruit = ref({ copy: "推荐领队 首次带队完成后 奖励推荐者200元", reward: 200, code: "" });
onMounted(async () => {
  list.value = (await http.get("/guides")).data || [];
  try {
    recruit.value = (await http.get("/guides/recruit")).data || recruit.value;
  } catch {
    /* ignore */
  }
});
</script>
