<template>
  <div class="route-catalog">
    <p class="muted catalog-lead">官方线路。点进去看介绍，有排期就能报，没有可以自己开一团。</p>
    <div class="chips">
      <div class="chip" :class="{ on: days === 0 }" @click="setDays(0)">全部天数</div>
      <div class="chip" :class="{ on: days === n }" v-for="n in [1, 2, 3]" :key="n" @click="setDays(n)">{{ n }}日</div>
      <div class="chip" :class="{ on: days === 'multi' }" @click="setDays('multi')">多日</div>
    </div>
    <div class="chips">
      <div class="chip" :class="{ on: tag === '' }" @click="setTag('')">全部玩法</div>
      <div
        class="play-tag"
        :class="{ on: tag === t.name }"
        v-for="t in tags"
        :key="t.id"
        :style="{ background: t.color, opacity: tag === t.name || tag === '' ? 1 : 0.45 }"
        @click="setTag(t.name)"
      >{{ t.name }}</div>
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
    <p class="muted" v-if="ready && !list.length">没有匹配的线路</p>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";
import http from "@/api/http";

const props = defineProps({
  q: { type: String, default: "" },
  seedTag: { type: String, default: "" },
});

const list = ref([]);
const days = ref(0);
const tag = ref("");
const tags = ref([]);
const ready = ref(false);

async function load() {
  const params = {};
  if (days.value) params.days = days.value;
  if (tag.value) params.tag = tag.value;
  if (props.q) params.q = props.q;
  try {
    list.value = (await http.get("/routes", { params })).data || [];
  } catch {
    list.value = [];
  }
  ready.value = true;
}

function setDays(n) {
  days.value = n;
  load();
}
function setTag(name) {
  tag.value = name;
  load();
}

watch(() => props.q, () => load());

onMounted(async () => {
  tag.value = props.seedTag || "";
  tags.value = (await http.get("/play-tags").catch(() => ({ data: [] }))).data || [];
  load();
});
</script>
