<template>
  <div class="trip-page">
    <div v-if="!store.token" class="card">
      <div class="pad">
        <strong>登录后看出行计划</strong>
        <p class="muted">山野团和同城局都会出现在这里，出发前能看到集合时间和地点。</p>
        <button class="btn block" type="button" @click="goLogin()">登录查看行程</button>
      </div>
    </div>

    <template v-else>
      <p v-if="upcoming.length" class="trip-sec">待出行 {{ upcoming.length }}</p>
      <article class="card" v-for="o in upcoming" :key="o.id">
        <div class="pad tap" @click="goSchedule(o)">
          <div class="act-card inner">
            <div class="act-date">
              <b>{{ dateOf(o).day }}</b>
              <span>{{ dateOf(o).weekday }}</span>
              <small>{{ dateOf(o).month }}</small>
            </div>
            <div class="act-main">
              <div class="row">
                <strong>{{ o.title }}</strong>
                <span class="tag">{{ kindLabel(o) }}</span>
              </div>
              <p class="muted">{{ o.meetup_time || "" }} {{ o.meetup_point || o.city || "" }}</p>
              <p class="act-meta">
                <span>{{ enrollStatusText(o) }}</span>
                <span v-if="o.seat_no">{{ o.seat_no }} 座</span>
                <span>¥{{ o.pay_amount }}</span>
              </p>
            </div>
          </div>
        </div>
        <div v-if="o.canCancel" class="pad" style="padding-top:0">
          <button class="btn ghost block" style="color:var(--clay)" :disabled="cancelling === o.id" @click.stop="cancel(o)">取消报名</button>
        </div>
      </article>
      <div v-if="!upcoming.length && !past.length" class="card act-empty">
        <div class="pad">
          <strong>还没有行程</strong>
          <p class="muted">去首页报一个山野团，或去活动页约一局。</p>
          <button class="btn block" type="button" @click="$router.push('/m')">去首页</button>
          <button class="btn ghost block" type="button" style="margin-top:8px" @click="$router.push('/m/activities')">去同城局</button>
        </div>
      </div>
      <div v-else-if="!upcoming.length" class="card">
        <div class="pad muted">最近没有待出行。历史报名在下面。</div>
      </div>

      <template v-if="past.length">
        <p class="trip-sec">历史 {{ past.length }}</p>
        <article class="card" v-for="o in past" :key="o.id">
          <div class="pad tap" @click="goSchedule(o)">
            <div class="row">
              <strong>{{ o.title }}</strong>
              <span class="tag">{{ o.status === "cancelled" ? "已取消" : kindLabel(o) }}</span>
            </div>
            <p class="muted" style="margin:6px 0 0">{{ o.start_date }} · {{ enrollStatusText(o) }} · ¥{{ o.pay_amount }}</p>
          </div>
          <div v-if="o.canComplete || o.completed" class="pad" style="padding-top:0">
            <button class="btn block" type="button" @click.stop="$router.push('/m/after/' + o.schedule_id)">
              {{ o.completed ? "评价 / 抽奖 / 评选" : "完成活动" }}
            </button>
          </div>
          <div v-if="o.canReview" class="pad" style="padding-top:0" @click.stop>
            <button v-if="reviewing !== o.id" class="btn ghost block" @click="openReview(o)">去评价</button>
            <div v-else>
              <div class="star-pick">
                <button v-for="n in 5" :key="n" type="button" :class="{ on: form.rating >= n }" @click="form.rating = n">★</button>
              </div>
              <textarea class="input" v-model="form.content" rows="3" placeholder="这次出行怎么样（选填）" />
              <div style="display:flex;gap:8px">
                <button class="btn ghost" style="flex:1" @click="reviewing = 0">取消</button>
                <button class="btn" style="flex:1" :disabled="submitting" @click="submitReview(o)">提交评价</button>
              </div>
            </div>
          </div>
          <p v-else-if="o.reviewed" class="pad muted" style="padding-top:0">已评价</p>
        </article>
      </template>
    </template>
    <p v-if="msg" class="muted">{{ msg }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { enrollStatusText } from "@/utils/labels";
import { formatActivityDate } from "@/utils/activityKind";
import { splitTrips, tripKindLabel } from "@/utils/trips";

const store = useUserStore();
const router = useRouter();
const list = ref([]);
const msg = ref("");
const cancelling = ref(0);
const reviewing = ref(0);
const submitting = ref(false);
const form = ref({ rating: 5, content: "" });

const upcoming = computed(() => splitTrips(list.value).upcoming);
const past = computed(() => splitTrips(list.value).past);

onMounted(load);

async function load() {
  if (!store.token) {
    list.value = [];
    return;
  }
  list.value = (await http.get("/orders")).data || [];
}
function dateOf(o) {
  return formatActivityDate(o.start_date);
}
function kindLabel(o) {
  return tripKindLabel(o);
}
function goLogin() {
  router.push({ path: "/m/login", query: { redirect: "/m/orders" } });
}
function goSchedule(o) {
  if (o.schedule_id) router.push("/m/schedule/" + o.schedule_id);
}
function openReview(o) {
  reviewing.value = o.id;
  form.value = { rating: 5, content: "" };
  msg.value = "";
}
async function submitReview(o) {
  submitting.value = true;
  msg.value = "";
  try {
    await http.post("/reviews", {
      scheduleId: o.schedule_id,
      rating: form.value.rating,
      content: form.value.content,
    });
    reviewing.value = 0;
    await load();
    msg.value = "评价已提交";
  } catch (e) {
    msg.value = e.message || "评价失败";
  } finally {
    submitting.value = false;
  }
}
async function cancel(o) {
  if (!window.confirm("确定取消报名？名额将释放给其他人。已付款的会标记退款。")) return;
  cancelling.value = o.id;
  msg.value = "";
  try {
    await http.post(`/orders/${o.id}/cancel`);
    await load();
    msg.value = "已取消报名";
  } catch (e) {
    msg.value = e.message || "取消失败";
  } finally {
    cancelling.value = 0;
  }
}
</script>
