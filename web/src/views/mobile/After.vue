<template>
  <div v-if="s">
    <div class="card"><div class="pad">
      <strong>{{ s.title }}</strong>
      <p class="muted">{{ s.startDate }} · 回来的大巴上可点完成，然后评价、抽奖、评选。</p>
      <p v-if="s.completed" style="color:var(--leaf)">已完成活动{{ s.completedAt ? " · " + s.completedAt : "" }}</p>
      <p v-else-if="!s.joined" class="muted">报名参加后才能完成活动。</p>
    </div></div>
    <p v-if="msg" :style="ok ? 'color:var(--leaf)' : 'color:var(--clay)'">{{ msg }}</p>
    <button v-if="s.canComplete" class="btn block" type="button" :disabled="loading" @click="complete">{{ loading ? "提交中…" : "完成活动" }}</button>

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

      <div class="h2">第二次抽奖</div>
      <div class="card"><div class="pad">
        <p class="muted" v-if="s.lottery?.pre">第一次抽到：{{ s.lottery.pre.prizeLabel }}</p>
        <p v-if="s.lottery?.post"><strong>{{ s.lottery.post.prizeLabel }}</strong>{{ s.lottery.post.doubled ? " · 两次一致，已翻倍" : "" }}</p>
        <button v-else class="btn block" type="button" :disabled="drawing" @click="drawPost">抽第二次</button>
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
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";

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
const posting = ref(false);
const rating = ref(5);
const reviewText = ref("");
const shareUrl = ref("");
const caption = ref("");

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
    msg.value = "已完成，可以评价、抽奖和参加评选";
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
    msg.value = res.data.matched ? `两次都是「${res.data.prizeLabel}」，已翻倍` : `抽到：${res.data.prizeLabel}`;
    await load();
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    drawing.value = false;
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
