<template>
  <div>
    <input class="input" v-model="q" placeholder="搜索长城 / 十渡 / 坝上 / 野三坡" @keyup.enter="load" />
    <div class="chips">
      <div class="chip" :class="{ on: days === 0 }" @click="setDays(0)">全部天数</div>
      <div class="chip" :class="{ on: days === n }" v-for="n in [1, 2, 3]" :key="n" @click="setDays(n)">{{ n }}日</div>
      <div class="chip" :class="{ on: days === 'multi' }" @click="setDays('multi')">多日</div>
    </div>
    <div class="chips">
      <div class="chip" :class="{ on: tag === '' }" @click="setTag('')">全部玩法</div>
      <div class="play-tag" :class="{ on: tag === t.name }" v-for="t in tags" :key="t.id" :style="{ background: t.color, opacity: tag === t.name || tag === '' ? 1 : 0.45 }" @click="setTag(t.name)">{{ t.name }}</div>
    </div>
    <div class="card" v-for="r in list" :key="r.id" @click="$router.push('/m/route/' + r.id)">
      <img class="cover" :src="r.cover" />
      <div class="pad">
        <div class="row"><strong>{{ r.title }}</strong><span class="tag">{{ r.days }}日 · {{ r.difficulty }}</span></div>
        <div class="tag-row">
          <span class="play-tag sm" v-for="t in r.playTags || r.tags || []" :key="t.id || t" :style="{ background: t.color || '#2d6a4f' }">{{ t.name || t }}</span>
        </div>
        <div class="muted" style="margin:6px 0 8px">{{ r.region }} · {{ r.season }}</div>
        <div class="price-pair">
          <s v-if="r.fromPrice > r.memberFromPrice" class="price-origin">¥{{ r.fromPrice }}</s>
          <span class="price">¥{{ r.memberFromPrice || r.fromPrice }} <small>起，满员更低</small></span>
        </div>
      </div>
    </div>
    <p class="muted" v-if="!list.length">没有匹配的线路</p>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";

const route = useRoute();
const router = useRouter();
const list = ref([]);
const q = ref("");
const days = ref(0);
const tag = ref("");
const tags = ref([]);

function applyQuery() {
  days.value = route.query.days === "multi" ? "multi" : Number(route.query.days) || 0;
  tag.value = route.query.tag ? String(route.query.tag) : route.query.category ? String(route.query.category) : "";
}

async function load() {
  const params = {};
  if (days.value) params.days = days.value;
  if (tag.value) params.tag = tag.value;
  if (q.value) params.q = q.value;
  list.value = (await http.get("/routes", { params })).data;
}

function syncQuery() {
  const query = {};
  if (days.value) query.days = String(days.value);
  if (tag.value) query.tag = tag.value;
  if (q.value) query.q = q.value;
  router.replace({ path: "/m/routes", query });
}

function setDays(n) {
  days.value = n;
  syncQuery();
}
function setTag(c) {
  tag.value = c;
  syncQuery();
}

watch(
  () => route.query,
  () => {
    applyQuery();
    load();
  }
);

onMounted(async () => {
  applyQuery();
  if (route.query.q) q.value = String(route.query.q);
  tags.value = (await http.get("/play-tags").catch(() => ({ data: [] }))).data || [];
  load();
});
</script>
