<template>
  <div class="lottery-page">
    <div class="card"><div class="pad">
      <strong>{{ state.title || "活动抽奖" }}</strong>
      <p class="muted">{{ blurb }}</p>
    </div></div>
    <div class="card"><div class="pad">
      <LotteryWheel
        ref="wheel"
        :prizes="state.prizes || []"
        :spin-seconds="state.spinSeconds || 5"
        :disabled="!state.canPre || spinning"
        :park-key="state.pre?.prizeKey || ''"
        :go-text="state.canPre ? '抽奖' : '已抽'"
        @request="draw('pre')"
      />
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
    <p v-if="!store.token" class="muted">登录后才能转动圆盘。</p>
    <p v-else-if="state.pre && !state.post" class="muted">第一次已抽过。出行回来后到「我的报名」点完成活动，再抽第二次。</p>
    <button class="btn ghost block" type="button" style="margin-top:8px" @click="$router.push(scheduleId ? '/m/schedule/' + scheduleId : '/m')">{{ scheduleId ? "回本团" : "去看团" }}</button>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import LotteryWheel from "@/components/LotteryWheel.vue";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const wheel = ref(null);
const state = ref({ pre: null, post: null, canPre: false, prizes: [], title: "活动抽奖", spinSeconds: 5 });
const msg = ref("");
const ok = ref(false);
const spinning = ref(false);
const scheduleId = computed(() => Number(route.query.scheduleId || 0));

const blurb = computed(() => {
  if (scheduleId.value && state.value.enabled) {
    return `本团专属转盘。指针停稳大约 ${state.value.spinSeconds || 5} 秒。报名前抽一次，完成活动后再抽一次；两次不是谢谢参与且奖品相同，积分翻倍。`;
  }
  return `转盘停稳大约 ${state.value.spinSeconds || 5} 秒。报名前可抽一次。完成活动后再抽第二次。两次奖品一致且不是谢谢参与，即可翻倍。`;
});

onMounted(load);

async function load() {
  try {
    state.value = (await http.get("/lottery", { params: { scheduleId: scheduleId.value || 0 } })).data;
  } catch {
    state.value = { pre: null, post: null, canPre: false, prizes: [], title: "活动抽奖", spinSeconds: 5 };
  }
}

async function draw(phase) {
  if (!requireLogin(store, router, route)) return;
  spinning.value = true;
  msg.value = "";
  try {
    const res = await http.post("/lottery/draw", { phase, scheduleId: scheduleId.value || 0 });
    ok.value = true;
    if (wheel.value) await wheel.value.play(res.data);
    msg.value = res.data.already ? "已经抽过了" : "";
    await load();
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    spinning.value = false;
  }
}
</script>
