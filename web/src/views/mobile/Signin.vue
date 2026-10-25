<template>
  <LoadRow v-if="!ready" />
  <div class="sg-page" v-else-if="state">
    <div class="sg-card">
      <div class="sg-top">
        <div>
          <strong>每日签到</strong>
          <p>已连续 {{ state.streak }} 天 · 当前 {{ state.points }} 积分</p>
        </div>
        <b>+{{ state.todayPoints }}</b>
      </div>
      <div class="sg-days">
        <div v-for="day in state.days" :key="day.day" class="sg-day" :class="{ on: day.signed, today: day.today }">
          <b>+{{ day.points }}</b>
          <span>{{ day.label }}</span>
        </div>
      </div>
      <button class="sg-go" type="button" :disabled="state.signedToday" @click="sign">
        {{ state.signedToday ? "今日已签到" : "立即签到" }}
      </button>
    </div>

    <div v-if="result" class="sg-mask" @click.self="result = null">
      <div class="sg-result">
        <strong>签到成功</strong>
        <b>+{{ result.gained }} 积分</b>
        <p>已连续 {{ result.streak }} 天，积分已入账</p>
        <button type="button" @click="result = null">知道了</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import LoadRow from "@/components/LoadRow.vue";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const state = ref(null);
const ready = ref(false);
const result = ref(null);

onMounted(load);

async function load() {
  if (!requireLogin(store, router, route)) return;
  try {
    state.value = (await http.get("/me/signin")).data;
  } catch {
    state.value = null;
  } finally {
    ready.value = true;
  }
}

async function sign() {
  if (!state.value || state.value.signedToday) return;
  const data = (await http.post("/me/signin")).data;
  state.value = data;
  if (store.profile) store.profile.points = data.points;
  if (!data.already && data.gained) result.value = data;
}
</script>
