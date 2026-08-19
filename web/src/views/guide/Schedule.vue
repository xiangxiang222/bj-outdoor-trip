<template>
  <div v-if="s">
    <div class="card">
      <div class="pad">
        <strong>{{ s.route.title }}</strong>
        <p>{{ s.startDate }} · {{ s.bus?.name }}</p>
        <p>集合 {{ s.meetupPoint }} {{ s.meetupTime }}</p>
        <p>已报 {{ s.enrolled }} / {{ s.maxSeats }} · 已签到 {{ checked }}</p>
        <div v-if="weather" class="weather" :class="weather.alerts?.[0]?.level">
          <strong>{{ weather.summary }} {{ weather.tmin }}~{{ weather.tmax }}℃</strong>
          <p>{{ weather.alerts?.[0]?.text }}</p>
        </div>
      </div>
    </div>
    <div class="h2">出行名单</div>
    <div class="card">
      <div class="pad chain-item" v-for="r in s.roster" :key="r.id">
        <span>{{ r.seatNo || "-" }}</span>
        <span>{{ r.name }} · {{ r.phone }}<div class="muted">紧急 {{ r.emergencyName || "未填" }} {{ r.emergencyPhone || "" }}</div></span>
        <button v-if="!r.checkinAt" class="btn" style="padding:4px 10px" @click="checkin(r)">签到</button>
        <span v-else class="muted">已签</span>
      </div>
      <p v-if="!s.roster?.length" class="muted pad">还没有有效报名。</p>
    </div>
    <p v-if="msg" class="muted">{{ msg }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http from "@/api/http";

const route = useRoute();
const s = ref(null);
const weather = ref(null);
const msg = ref("");
const checked = computed(() => (s.value?.roster || []).filter((r) => r.checkinAt).length);

onMounted(load);

async function load() {
  s.value = (await http.get("/guide/schedules/" + route.params.id)).data;
  try {
    weather.value = (await http.get("/weather", { params: { region: s.value.route.region, date: s.value.startDate } })).data;
  } catch {
    weather.value = null;
  }
}

async function checkin(row) {
  try {
    await http.post(`/guide/schedules/${route.params.id}/checkin`, { enrollmentId: row.id });
    msg.value = `${row.name} 已签到`;
    await load();
  } catch (e) {
    msg.value = e.message;
  }
}
</script>
