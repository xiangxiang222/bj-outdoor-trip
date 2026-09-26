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
      <div class="chips">
        <div class="chip" :class="{ on: tab === 'unpaid' }" @click="tab = 'unpaid'">待支付 {{ unpaid.length }}</div>
        <div class="chip" :class="{ on: tab === 'waitlist' }" @click="tab = 'waitlist'">候补 {{ waitlist.length }}</div>
        <div class="chip" :class="{ on: tab === 'depart' }" @click="tab = 'depart'">待出发 {{ depart.length }}</div>
        <div class="chip" :class="{ on: tab === 'review' }" @click="tab = 'review'">待评价 {{ review.length }}</div>
        <div class="chip" :class="{ on: tab === 'refund' }" @click="tab = 'refund'">退款 {{ refund.length }}</div>
        <div class="chip" :class="{ on: tab === 'past' }" @click="tab = 'past'">历史 {{ past.length }}</div>
      </div>

      <template v-if="tab === 'depart'">
        <div v-if="nextTrip" class="card trip-soon">
          <div class="pad tap" @click="goSchedule(nextTrip)">
            <div class="muted">下一趟 · {{ kindLabel(nextTrip) }}</div>
            <strong>{{ nextTrip.title }}</strong>
            <p class="muted" style="margin:6px 0 0">{{ nextTrip.start_date }} {{ nextTrip.meetup_time || "" }} · {{ nextTrip.meetup_point || nextTrip.city || "" }}</p>
          </div>
          <button v-if="nextTrip.canPay" class="cancel-link" type="button" @click.stop="goPay(nextTrip)">去支付</button>
          <button v-if="nextTrip.canCancel" class="cancel-link" type="button" :disabled="cancelling === nextTrip.id" @click.stop="cancel(nextTrip)">取消报名</button>
        </div>
        <article class="card" v-for="o in restUpcoming" :key="o.id">
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
                  <span>{{ statusLine(o) }}</span>
                  <span v-if="o.channel !== 'activity' && o.seat_no">{{ o.seat_no }} 座</span>
                  <span>{{ moneyText(o) }}</span>
                </p>
              </div>
            </div>
          </div>
          <button v-if="o.canPay" class="cancel-link" type="button" @click.stop="goPay(o)">去支付</button>
          <button v-if="o.canCancel" class="cancel-link" type="button" :disabled="cancelling === o.id" @click.stop="cancel(o)">取消报名</button>
        </article>
        <div v-if="!depart.length && !waitlist.length && !past.length && !unpaid.length" class="card act-empty">
          <div class="pad">
            <strong>还没有行程</strong>
            <p class="muted">去首页报一个山野团，或去活动页约一局。</p>
            <button class="btn block" type="button" @click="$router.push('/m')">去首页</button>
            <button class="btn ghost block" type="button" style="margin-top:8px" @click="$router.push('/m/activities')">去同城局</button>
          </div>
        </div>
        <div v-else-if="!depart.length" class="card">
          <div class="pad muted">{{ waitlist.length ? "没有已占座的行程。候补在「候补」里。" : "最近没有待出行。点上面「历史」看过往报名。" }}</div>
        </div>
      </template>

      <template v-else-if="tab === 'waitlist'">
        <article class="card" v-for="o in waitlist" :key="o.id">
          <div class="pad tap" @click="goSchedule(o)">
            <div class="row">
              <strong>{{ o.title }}</strong>
              <span class="tag">候补</span>
            </div>
            <p class="muted" style="margin:6px 0 0">{{ o.start_date }} {{ o.meetup_time || "" }} · {{ o.meetup_point || o.city || "" }}</p>
            <p class="act-meta">
              <span>{{ statusLine(o) }}</span>
              <span>{{ moneyText(o) }}</span>
            </p>
          </div>
          <button v-if="o.canCancel" class="cancel-link" type="button" :disabled="cancelling === o.id" @click.stop="cancel(o)">取消候补</button>
        </article>
        <div v-if="!waitlist.length" class="card">
          <div class="pad muted">还没有候补。满员团仍可报名进候补，有人取消后按顺序递补。</div>
        </div>
      </template>

      <template v-else-if="tab === 'unpaid'">
        <article class="card" v-for="o in unpaid" :key="o.id">
          <div class="pad tap" @click="goSchedule(o)">
            <div class="row">
              <strong>{{ o.title }}</strong>
              <span class="tag">待支付</span>
            </div>
            <p class="muted" style="margin:6px 0 0">{{ o.start_date }} · {{ moneyText(o) }}</p>
          </div>
          <button v-if="o.canPay" class="cancel-link" type="button" @click.stop="goPay(o)">去支付</button>
        </article>
        <div v-if="!unpaid.length" class="card"><div class="pad muted">没有待支付的报名。</div></div>
      </template>

      <template v-else-if="tab === 'review'">
        <article class="card" v-for="o in review" :key="o.id">
          <div class="pad tap" @click="goSchedule(o)">
            <div class="row">
              <strong>{{ o.title }}</strong>
              <span class="tag">待评价</span>
            </div>
            <p class="muted" style="margin:6px 0 0">{{ o.start_date }} · {{ statusLine(o) }}</p>
          </div>
          <div class="pad" style="padding-top:0" @click.stop>
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
        </article>
        <div v-if="!review.length" class="card"><div class="pad muted">回来的行程都评过了。</div></div>
      </template>

      <template v-else-if="tab === 'refund'">
        <article class="card" v-for="o in refund" :key="o.id">
          <div class="pad tap" @click="goSchedule(o)">
            <div class="row">
              <strong>{{ o.title }}</strong>
              <span class="tag">退款</span>
            </div>
            <p class="muted" style="margin:6px 0 0">{{ o.refundProgress.text }}</p>
            <p class="muted" style="margin:6px 0 0">{{ o.start_date }}</p>
          </div>
        </article>
        <div v-if="!refund.length" class="card"><div class="pad muted">还没有退款记录。取消后会写在这里：退回余额或原路退回微信。</div></div>
      </template>

      <template v-else>
        <article class="card" v-for="o in past" :key="o.id">
          <div class="pad tap" @click="goSchedule(o)">
            <div class="row">
              <strong>{{ o.title }}</strong>
              <span class="tag">{{ o.status === "cancelled" ? "已取消" : kindLabel(o) }}</span>
            </div>
            <p class="muted" style="margin:6px 0 0">{{ o.start_date }} · {{ statusLine(o) }} · {{ moneyText(o) }}</p>
            <p v-if="o.refundProgress" class="muted" style="margin:6px 0 0">{{ o.refundProgress.text }}</p>
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
        <div v-if="!past.length" class="card">
          <div class="pad muted">还没有历史报名。</div>
        </div>
      </template>
    </template>
    <p v-if="msg" class="muted">{{ msg }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { enrollStatusText } from "@/utils/labels";
import { formatActivityDate } from "@/utils/activityKind";
import { deskTrips, tripKindLabel } from "@/utils/trips";

const store = useUserStore();
const router = useRouter();
const pageRoute = useRoute();
const list = ref([]);
const msg = ref("");
const cancelling = ref(0);
const reviewing = ref(0);
const submitting = ref(false);
const form = ref({ rating: 5, content: "" });
const tabs = new Set(["unpaid", "waitlist", "depart", "review", "refund", "past"]);
function initialTab() {
  const q = String(pageRoute.query.tab || "");
  if (q === "upcoming") return "depart";
  return tabs.has(q) ? q : "depart";
}
const tab = ref(initialTab());
const holdTab = ref(Boolean(pageRoute.query.tab));

const split = computed(() => deskTrips(list.value));
const depart = computed(() => split.value.depart);
const unpaid = computed(() => split.value.unpaid);
const review = computed(() => split.value.review);
const refund = computed(() => split.value.refund);
const waitlist = computed(() => split.value.waitlist);
const past = computed(() => split.value.past);
const nextTrip = computed(() => depart.value[0] || null);
const restUpcoming = computed(() => depart.value.slice(1));

onMounted(load);

async function load() {
  if (!store.token) {
    list.value = [];
    return;
  }
  list.value = (await http.get("/orders")).data || [];
  if (holdTab.value) {
    holdTab.value = false;
    return;
  }
  if (tab.value !== "depart") return;
  const desk = deskTrips(list.value);
  if (!desk.depart.length && desk.waitlist.length) tab.value = "waitlist";
  else if (!desk.depart.length && !desk.waitlist.length && desk.past.length) tab.value = "past";
}
function dateOf(o) {
  return formatActivityDate(o.start_date);
}
function kindLabel(o) {
  return tripKindLabel(o);
}
function moneyText(o) {
  if (o.channel === "activity" && Number(o.pay_amount || 0) === 0) return "免费";
  if (o.pay_status === "unpaid" && Number(o.remainAmount || 0) > 0) {
    return Number(o.paidAmount || 0) > 0 ? `已付 ¥${o.paidAmount} / ¥${o.payAmount || o.pay_amount}` : "待付 ¥" + (o.remainAmount || o.pay_amount);
  }
  return "¥" + (o.payAmount || o.pay_amount);
}
function statusLine(o) {
  if (o.channel === "activity" && o.status === "joined") return "已报名";
  return enrollStatusText(o);
}
function goLogin() {
  router.push({ path: "/m/login", query: { redirect: "/m/orders" } });
}
function goSchedule(o) {
  if (o.schedule_id) router.push("/m/schedule/" + o.schedule_id);
}
function goPay(o) {
  if (o.payShareToken) router.push("/m/pay/" + o.payShareToken);
  else goSchedule(o);
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
  if (!window.confirm(o.refundHint ? `确定取消报名？${o.refundHint}。名额将释放给其他人。已付款按付款人原路退回。` : "确定取消报名？名额将释放给其他人。已付款按付款人原路退回。")) return;
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
