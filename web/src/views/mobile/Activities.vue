<template>
  <div>
    <p class="muted">约掼蛋、跑步、看电影，或品牌发布招募。户外路线请走首页。</p>
    <button class="btn block" type="button" @click="goPublish">发布活动</button>
    <div class="chips" style="margin:12px 0">
      <div class="chip" :class="{ on: !kind }" @click="kind = ''">全部</div>
      <div class="chip" :class="{ on: kind === k }" v-for="k in kinds" :key="k" @click="kind = k">{{ k }}</div>
    </div>
    <div class="trip-card" v-for="s in list" :key="s.id" @click="$router.push('/m/schedule/' + s.id)">
      <img v-if="s.route?.cover" class="trip-swipe" :src="s.route.cover" :alt="s.route.title" />
      <div class="pad">
        <div class="row">
          <strong>{{ s.route?.title }}</strong>
          <span class="tag">{{ s.startDate }}</span>
        </div>
        <p class="muted" style="margin:6px 0">{{ s.city }} · {{ s.organizerName }}</p>
        <TripPrices :quote="s.quote" compact />
      </div>
    </div>
    <div v-if="!list.length" class="card"><div class="pad muted">还没有活动，先发一个。</div></div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import TripPrices from "@/components/TripPrices.vue";

const router = useRouter();
const store = useUserStore();
const rows = ref([]);
const kind = ref("");
const kinds = ["掼蛋", "跑步", "电影", "招募"];

const list = computed(() => {
  if (!kind.value) return rows.value;
  return rows.value.filter((s) => (s.route?.title || "").includes(kind.value) || (s.playTags || []).some((t) => t.name === kind.value));
});

onMounted(async () => {
  rows.value = (await http.get("/schedules", { params: { channel: "activity" } }).catch(() => ({ data: [] }))).data || [];
});

function goPublish() {
  const path = "/m/publish?channel=activity";
  if (!store.token) router.push({ path: "/m/login", query: { redirect: path } });
  else router.push(path);
}
</script>
