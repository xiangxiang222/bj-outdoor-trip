<template>
  <div>
    <input class="input" v-model="q" placeholder="搜索长城 / 十渡 / 坝上 / 野三坡" @keyup.enter="load" />
    <div class="chips">
      <div class="chip" :class="{ on: days === 0 }" @click="setDays(0)">全部天数</div>
      <div class="chip" :class="{ on: days === n }" v-for="n in [1, 2, 3, 5]" :key="n" @click="setDays(n)">{{ n }}日</div>
    </div>
    <div class="chips">
      <div class="chip" :class="{ on: category === c }" v-for="c in cats" :key="c" @click="setCat(c)">{{ c }}</div>
    </div>
    <div class="card" v-for="r in list" :key="r.id" @click="$router.push('/m/route/' + r.id)">
      <img class="cover" :src="r.cover" />
      <div class="pad">
        <div class="row"><strong>{{ r.title }}</strong><span class="tag">{{ r.days }}日 · {{ r.difficulty }}</span></div>
        <div class="muted" style="margin:6px 0 8px">{{ r.region }} · {{ r.season }}</div>
        <div class="price">¥{{ r.fromPrice }} <small>起，满员更低</small></div>
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
const category = ref("全部");
const cats = ["全部", "长城", "玩水", "登山", "山水", "文化", "草原", "海滨"];

function applyQuery() {
  days.value = Number(route.query.days) || 0;
  category.value = route.query.category ? String(route.query.category) : "全部";
}

async function load() {
  const params = {};
  if (days.value) params.days = days.value;
  if (category.value !== "全部") params.category = category.value;
  if (q.value) params.q = q.value;
  list.value = (await http.get("/routes", { params })).data;
}

function syncQuery() {
  const query = {};
  if (days.value) query.days = String(days.value);
  if (category.value !== "全部") query.category = category.value;
  if (q.value) query.q = q.value;
  router.replace({ path: "/m/routes", query });
}

function setDays(n) {
  days.value = n;
  syncQuery();
}
function setCat(c) {
  category.value = c;
  syncQuery();
}

watch(
  () => route.query,
  () => {
    applyQuery();
    load();
  }
);

onMounted(() => {
  applyQuery();
  if (route.query.q) q.value = String(route.query.q);
  load();
});
</script>
