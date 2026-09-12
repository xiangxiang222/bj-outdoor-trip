<template>
  <div class="lottery-page">
    <template v-if="!scheduleId && trips.length">
      <div class="h2">本团抽奖</div>
      <div class="card" v-for="t in trips" :key="t.scheduleId" @click="$router.push('/m/lottery?scheduleId=' + t.scheduleId)">
        <div class="pad row">
          <div>
            <strong>{{ t.routeTitle || t.title }}</strong>
            <p class="muted" style="margin:4px 0 0">{{ t.startDate }}{{ t.drawLabel ? " · " + t.drawLabel : "" }}</p>
            <p style="margin:6px 0 0">{{ t.resultLabel || (t.canPre || t.canPost ? "还没抽" : "已抽完") }}</p>
          </div>
          <span class="nav-link">去转盘 ›</span>
        </div>
      </div>
      <div class="h2">平台抽奖</div>
    </template>
    <div class="card"><div class="pad">
      <strong>{{ scheduleId ? (state.title || "本团抽奖") : "平台抽奖" }}</strong>
      <p class="muted">{{ blurb }}</p>
    </div></div>
    <div class="card"><div class="pad">
      <LotteryWheel
        ref="wheel"
        :prizes="state.prizes || []"
        :spin-seconds="state.spinSeconds || 5"
        :disabled="!canDraw || spinning"
        :park-key="parkKey"
        :go-text="canDraw ? '抽奖' : (hasResult ? '已抽' : '抽奖')"
        @request="draw"
      />
    </div></div>
    <div class="card" v-if="state.pre"><div class="pad">
      <div class="muted">报名前</div>
      <strong>{{ state.pre.prizeLabel }}</strong>
      <p class="muted" v-if="state.pre.prizeInfo && state.pre.level < 9">{{ state.pre.prizeInfo }}{{ state.pre.rate != null ? ' · 中奖率 ' + state.pre.rate + '%' : '' }}</p>
      <p class="muted" v-if="state.pre.claimHint">{{ state.pre.claimHint }}</p>
    </div></div>
    <div class="card" v-if="state.post"><div class="pad">
      <div class="muted">报名后{{ state.post.doubled ? " · 两次一致" : "" }}</div>
      <strong>{{ state.post.prizeLabel }}</strong>
      <p class="muted" v-if="state.post.prizeInfo && state.post.level < 9">{{ state.post.prizeInfo }}{{ state.post.rate != null ? ' · 中奖率 ' + state.post.rate + '%' : '' }}</p>
      <p class="muted" v-if="state.post.claimHint">{{ state.post.claimHint }}</p>
    </div></div>
    <button v-if="state.canClaim" class="btn block" type="button" :disabled="claiming" @click="claim">{{ claiming ? "领取中…" : "跟团结束，领取奖品" }}</button>
    <p v-if="msg" :style="ok ? 'color:var(--leaf)' : 'color:var(--clay)'">{{ msg }}</p>
    <p v-if="!store.token" class="muted">登录后才能转动圆盘。</p>
    <p v-else-if="hint" class="muted">{{ hint }}</p>
    <button v-if="scheduleId" class="btn ghost block" type="button" style="margin-top:8px" @click="$router.push('/m/lottery')">我的抽奖</button>
    <button class="btn ghost block" type="button" style="margin-top:8px" @click="$router.push(scheduleId ? '/m/schedule/' + scheduleId : '/m')">{{ scheduleId ? "回本团" : "去看团" }}</button>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import LotteryWheel from "@/components/LotteryWheel.vue";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const wheel = ref(null);
const state = ref({
  pre: null,
  post: null,
  canPre: false,
  canPost: false,
  canClaim: false,
  prizes: [],
  title: "活动抽奖",
  spinSeconds: 5,
  drawMode: "off",
});
const msg = ref("");
const ok = ref(false);
const spinning = ref(false);
const claiming = ref(false);
const scheduleId = computed(() => Number(route.query.scheduleId || 0));
const trips = computed(() => state.value.trips || []);
const canDraw = computed(() => !!(state.value.canPre || state.value.canPost));
const hasResult = computed(() => !!(state.value.pre || state.value.post));
const parkKey = computed(() => state.value.post?.prizeKey || state.value.pre?.prizeKey || "");
const drawPhase = computed(() => {
  if (state.value.canPre) return "pre";
  if (state.value.canPost) return "post";
  return route.query.phase === "post" ? "post" : "pre";
});

const blurb = computed(() => {
  const sec = state.value.spinSeconds || 5;
  const mode = state.value.drawMode;
  if (mode === "pre") return `本团只在报名前抽一次，转盘约 ${sec} 秒。中奖先记账，跟团结束后领奖。`;
  if (mode === "enroll") return `本团报名后才能抽，转盘约 ${sec} 秒。中奖先记账，跟团结束后领奖。`;
  if (mode === "both") return `报名前、报名后各抽一次，转盘约 ${sec} 秒。中奖先记账，跟团结束后领奖。两次不是谢谢参与且奖品相同，领取时翻倍。`;
  return `转盘约 ${sec} 秒。报名前可抽一次，完成活动后再抽第二次。`;
});

const hint = computed(() => {
  if (state.value.canClaim) return "";
  if (state.value.canPost && !state.value.canPre) return "已报名，可以抽一次。";
  if (state.value.pre && state.value.drawMode === "enroll") return "";
  if (hasResult.value && !canDraw.value) return state.value.claimHint || "已经抽过了。";
  return "";
});

onMounted(load);
watch(scheduleId, load);

async function load() {
  try {
    state.value = (await http.get("/lottery", { params: { scheduleId: scheduleId.value || 0 } })).data;
  } catch {
    state.value = { pre: null, post: null, canPre: false, canPost: false, canClaim: false, prizes: [], title: "活动抽奖", spinSeconds: 5 };
  }
}

async function draw() {
  if (!requireLogin(store, router, route)) return;
  spinning.value = true;
  msg.value = "";
  try {
    const res = await http.post("/lottery/draw", { phase: drawPhase.value, scheduleId: scheduleId.value || 0 });
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

async function claim() {
  if (!requireLogin(store, router, route)) return;
  claiming.value = true;
  msg.value = "";
  try {
    const res = await http.post("/lottery/claim", { scheduleId: scheduleId.value });
    ok.value = true;
    msg.value = res.message || "奖品已领取";
    await load();
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    claiming.value = false;
  }
}
</script>
