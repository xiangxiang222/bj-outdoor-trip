<template>
  <div class="act-page">
    <div class="act-hero">
      <div>
        <strong>同城也能约</strong>
        <p>掼蛋、跑步、看电影，或发个招募。山野线路请回首页。</p>
      </div>
      <button class="btn" type="button" @click="goPublish()">发起一局</button>
    </div>
    <p class="act-week muted" v-if="rows.length">本周 {{ weekCount }} 场 · 共 {{ rows.length }} 场可报</p>

    <div class="act-kinds">
      <button
        class="act-kind"
        type="button"
        :class="{ on: kind === k.key }"
        v-for="k in kinds"
        :key="k.key"
        @click="kind = kind === k.key ? '' : k.key"
      >
        <span>{{ k.emoji }}</span>
        <em>{{ k.label }}</em>
        <small>{{ k.hint }}</small>
      </button>
    </div>

    <article class="feed-card" v-for="s in list" :key="s.id" @click="$router.push('/m/schedule/' + s.id)">
      <div class="feed-cover">
        <img v-if="coverOf(s)" :src="coverOf(s)" :alt="s.route?.title || ''" />
        <div class="feed-boarded">{{ boardedLine(s, "activity") }}</div>
      </div>
      <div class="feed-body">
        <p class="feed-when">{{ feedWhen(s.startDate, s.meetupTime) }} · {{ s.city }}</p>
        <h3 class="feed-title">{{ s.route?.title }}</h3>
        <p class="feed-host">{{ hostName(s) }}<template v-if="kindOf(s)"> · {{ kindOf(s).label }}</template></p>
        <p class="feed-tagline" v-if="taglineOf(s)">{{ taglineOf(s) }}</p>
        <p class="feed-price">
          <template v-if="isFree(s)">免费</template>
          <template v-else><b>¥{{ priceOf(s) }}</b> 起</template>
        </p>
      </div>
    </article>

    <div v-if="!list.length" class="card act-empty">
      <div class="pad">
        <strong>{{ kind ? `还没有「${kind}」局` : "还没有同城局" }}</strong>
        <p class="muted">发起一局，审核通过后会出现在这里。户外团请回首页发团。</p>
        <button class="btn ghost block" type="button" @click="goPublish(kind)">去发起</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { ACTIVITY_KINDS, activityKindOf, filterActivities, isThisWeek } from "@/utils/activityKind";
import { boardedLine, coverOf, feedWhen, hostName, taglineOf } from "@/utils/feedCard";

const router = useRouter();
const store = useUserStore();
const rows = ref([]);
const kind = ref("");
const kinds = ACTIVITY_KINDS;

const list = computed(() => filterActivities(rows.value, kind.value));
const weekCount = computed(() => rows.value.filter((s) => isThisWeek(s.startDate)).length);

onMounted(async () => {
  rows.value = (await http.get("/schedules", { params: { channel: "activity" } }).catch(() => ({ data: [] }))).data || [];
});

function kindOf(s) {
  return activityKindOf(s);
}
function isFree(s) {
  return Number(s.quote?.tripPrice ?? s.quote?.originPrice ?? 0) === 0 || s.offerType === "free";
}
function priceOf(s) {
  return s.quote?.tripPrice ?? s.quote?.originPrice ?? 0;
}
function goPublish(preset) {
  const path = preset ? `/m/publish?channel=activity&kind=${encodeURIComponent(preset)}` : "/m/publish?channel=activity";
  if (!store.token) router.push({ path: "/m/login", query: { redirect: path } });
  else router.push(path);
}
</script>
