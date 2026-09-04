<template>
  <div>
    <div class="card"><div class="pad">
      <strong>活动抽奖</strong>
      <p class="muted">报名前可抽一次。完成报名并参加活动后，在「完成活动」页再抽第二次。两次奖品一致且不是谢谢参与，即可翻倍领取。</p>
    </div></div>
    <div class="card" v-if="state.pre"><div class="pad">
      <div class="muted">第一次（报名前）</div>
      <strong>{{ state.pre.prizeLabel }}</strong>
    </div></div>
    <div class="card" v-if="state.post"><div class="pad">
      <div class="muted">第二次（参团后）</div>
      <strong>{{ state.post.prizeLabel }}{{ state.post.doubled ? " · 已翻倍" : "" }}</strong>
    </div></div>
    <p v-if="msg" :style="ok ? 'color:var(--leaf)' : 'color:var(--clay)'">{{ msg }}</p>
    <button v-if="state.canPre" class="btn block" type="button" :disabled="loading" @click="draw('pre')">{{ loading ? "抽取中…" : "报名前抽一次" }}</button>
    <p v-else-if="!state.pre" class="muted">请先登录后再抽。</p>
    <p v-else class="muted">第一次已抽过。出行回来后到「我的报名」点完成活动，再抽第二次。</p>
    <button class="btn ghost block" type="button" style="margin-top:8px" @click="$router.push('/m')">去看团</button>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const state = ref({ pre: null, post: null, canPre: false });
const msg = ref("");
const ok = ref(false);
const loading = ref(false);

onMounted(load);

async function load() {
  if (!store.token) return;
  try {
    state.value = (await http.get("/lottery", { params: { scheduleId: route.query.scheduleId || 0 } })).data;
  } catch {
    state.value = { pre: null, post: null, canPre: false };
  }
}

async function draw(phase) {
  if (!requireLogin(store, router, route)) return;
  loading.value = true;
  msg.value = "";
  try {
    const res = await http.post("/lottery/draw", { phase, scheduleId: Number(route.query.scheduleId || 0) });
    ok.value = true;
    msg.value = res.data.already ? "已经抽过了" : `抽到：${res.data.prizeLabel}`;
    await load();
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
