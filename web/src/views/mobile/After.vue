<template>
  <div v-if="s">
    <div class="card"><div class="pad">
      <strong>{{ s.title }}</strong>
      <p class="muted">{{ s.startDate }} · 交过费即可在行程结束后抽奖，不必签到。回来的大巴上点完成后再评价、评选。</p>
      <p v-if="s.completed" style="color:var(--leaf)">已完成活动{{ s.completedAt ? " · " + s.completedAt : "" }}</p>
      <p v-else-if="!s.joined" class="muted">报名参加后才能完成活动。</p>
    </div></div>
    <p v-if="msg" :style="ok ? 'color:var(--leaf)' : 'color:var(--clay)'">{{ msg }}</p>
    <button v-if="s.canComplete" class="btn block" type="button" :disabled="loading" @click="complete">{{ loading ? "提交中…" : "完成活动" }}</button>

    <div v-if="showLottery">
      <div class="h2" v-if="s.lottery?.drawMode !== 'pre'">{{ s.lottery?.drawMode === 'enroll' ? '报名后抽奖' : '行程结束后抽奖' }}</div>
      <div class="card" v-if="s.lottery?.drawMode !== 'pre'"><div class="pad">
        <p class="muted" v-if="s.lottery?.pre">报名前抽到：{{ s.lottery.pre.prizeLabel }}</p>
        <LotteryWheel
          ref="wheel"
          :prizes="s.lottery?.prizes || []"
          :spin-seconds="s.lottery?.spinSeconds || 5"
          :disabled="!s.lottery?.canPost || drawing"
          :park-key="s.lottery?.post?.prizeKey || ''"
          :go-text="s.lottery?.post ? '已抽' : '抽奖'"
          @request="drawPost"
        />
        <p v-if="s.lottery?.post">
          <strong>{{ s.lottery.post.prizeLabel }}</strong>
          <span v-if="s.lottery.post.rate != null"> · 中奖率 {{ s.lottery.post.rate }}%</span>
          {{ s.lottery.post.doubled ? " · 两次一致" : "" }}
        </p>
        <p class="muted" v-if="s.lottery?.post?.claimHint">{{ s.lottery.post.claimHint }}</p>
      </div></div>
      <div class="card" v-if="s.lottery?.drawMode === 'pre' && s.lottery?.pre"><div class="pad">
        <div class="muted">报名前抽到</div>
        <strong>{{ s.lottery.pre.prizeLabel }}</strong>
        <p class="muted" v-if="s.lottery.pre.prizeInfo && s.lottery.pre.level < 9">{{ s.lottery.pre.prizeInfo }}{{ s.lottery.pre.rate != null ? ' · 中奖率 ' + s.lottery.pre.rate + '%' : '' }}</p>
        <p class="muted" v-if="s.lottery.pre.claimHint">{{ s.lottery.pre.claimHint }}</p>
      </div></div>
      <p class="muted" v-if="s.lottery?.claimHint && !s.lottery?.canClaim">{{ s.lottery.claimHint }}</p>
      <button v-if="s.lottery?.canClaim" class="btn block" type="button" :disabled="claiming" @click="claim">{{ claiming ? "领取中…" : "领取奖品" }}</button>
    </div>

    <div v-if="s.completed">
      <div class="h2">评价领队和路线</div>
      <div class="card"><div class="pad">
        <p v-if="s.reviewedByMe" class="muted">你已评价。</p>
        <template v-else>
          <div class="star-pick">
            <button v-for="n in 5" :key="n" type="button" :class="{ on: rating >= n }" @click="rating = n">★</button>
          </div>
          <textarea class="input" v-model="reviewText" rows="3" placeholder="这次出行怎么样（选填）" />
          <button class="btn block" type="button" :disabled="saving" @click="submitReview">提交评价</button>
        </template>
      </div></div>

      <div class="h2">评选 · 分享投票</div>
      <div class="card"><div class="pad">
        <p class="muted">把朋友圈 / 小红书 / 视频号分享链接贴上来，团友投票。再结合平台本身的互动，按票数和规则评选。</p>
        <label>分享链接</label>
        <input class="input" v-model="shareUrl" placeholder="https://" />
        <label>一句话</label>
        <input class="input" v-model="caption" placeholder="今天这团最想安利的一点" />
        <button class="btn ghost block" type="button" :disabled="posting" @click="submitPost">提交评选</button>
      </div></div>
      <div class="card" v-for="p in posts" :key="p.id">
        <div class="pad">
          <div class="row">
            <strong>{{ p.name }}</strong>
            <span class="muted">{{ p.votes }} 票</span>
          </div>
          <p class="muted">{{ p.caption }}</p>
          <a class="nav-link" :href="p.url" target="_blank" rel="noreferrer">打开分享</a>
          <button v-if="!p.mine && !p.voted" class="btn ghost" type="button" style="margin-left:8px" @click="vote(p)">投票</button>
          <span v-else-if="p.voted" class="muted"> 已投</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import LotteryWheel from "@/components/LotteryWheel.vue";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const s = ref(null);
const posts = ref([]);
const msg = ref("");
const ok = ref(false);
const loading = ref(false);
const saving = ref(false);
const drawing = ref(false);
const claiming = ref(false);
const wheel = ref(null);
const posting = ref(false);
const rating = ref(5);
const reviewText = ref("");
const shareUrl = ref("");
const caption = ref("");
const showLottery = computed(() => {
  const l = s.value?.lottery;
  if (!l) return false;
  return !!(l.canPost || l.post || l.canClaim || l.pre);
});

onMounted(load);

async function load() {
  try {
    s.value = (await http.get("/schedules/" + route.params.id + "/after")).data;
    posts.value = (await http.get("/schedules/" + route.params.id + "/contest")).data || [];
  } catch (e) {
    ok.value = false;
    msg.value = e.message || "加载失败";
  }
}

async function complete() {
  if (!requireLogin(store, router, route)) return;
  loading.value = true;
  msg.value = "";
  try {
    await http.post("/schedules/" + route.params.id + "/complete");
    ok.value = true;
    msg.value = "已完成，可以评价和参加评选";
    await load();
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function submitReview() {
  if (!requireLogin(store, router, route)) return;
  saving.value = true;
  try {
    await http.post("/reviews", { scheduleId: Number(route.params.id), rating: rating.value, content: reviewText.value });
    ok.value = true;
    msg.value = "评价已提交";
    await load();
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function drawPost() {
  if (!requireLogin(store, router, route)) return;
  drawing.value = true;
  try {
    const res = await http.post("/lottery/draw", { phase: "post", scheduleId: Number(route.params.id) });
    ok.value = true;
    if (wheel.value) await wheel.value.play(res.data);
    msg.value = res.data.matched ? `两次都是「${res.data.prizeLabel}」，领取时翻倍` : "";
    await load();
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    drawing.value = false;
  }
}

async function claim() {
  if (!requireLogin(store, router, route)) return;
  claiming.value = true;
  try {
    const res = await http.post("/lottery/claim", { scheduleId: Number(route.params.id) });
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

async function submitPost() {
  if (!requireLogin(store, router, route)) return;
  posting.value = true;
  try {
    await http.post("/schedules/" + route.params.id + "/contest", { url: shareUrl.value, caption: caption.value });
    shareUrl.value = "";
    caption.value = "";
    await load();
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    posting.value = false;
  }
}

async function vote(p) {
  if (!requireLogin(store, router, route)) return;
  try {
    posts.value = (await http.post("/contest/" + p.id + "/vote")).data || [];
  } catch (e) {
    msg.value = e.message;
    ok.value = false;
  }
}
</script>
