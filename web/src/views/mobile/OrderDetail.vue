<template>
  <LoadRow v-if="!ready" />
  <div class="od-page" v-else-if="order">
    <div class="od-hero">
      <h2>{{ badge.label }}</h2>
      <p>{{ hint }}</p>
    </div>

    <section v-if="order.traveler_name || order.meetup_point || order.city" class="od-card od-block">
      <strong>{{ order.traveler_name || "出行人" }} {{ phone }}</strong>
      <p>{{ place }}</p>
    </section>

    <section class="od-card">
      <header class="od-head">
        <span class="od-shop">{{ shop }}</span>
        <button v-if="order.schedule_id" class="od-jump" type="button" @click="goSchedule">团详情 ›</button>
      </header>
      <div class="od-goods od-tap" @click="goSchedule">
        <img v-if="order.cover" :src="order.cover" alt="" />
        <span v-else class="od-ph"></span>
        <div>
          <b>{{ order.title }}</b>
          <p>{{ spec }}</p>
          <p v-if="order.seat_no">{{ order.seat_no }} 座</p>
        </div>
        <div class="od-price">
          <b>{{ money }}</b>
          <span>共1人</span>
        </div>
      </div>
      <p v-if="order.helpers?.length" class="od-help">帮忙支付 {{ order.helpers.map((row) => row.nickname).filter(Boolean).join("、") }}</p>
    </section>

    <section class="od-card od-lines">
      <div v-for="line in prices.lines" :key="line.label">
        <span>{{ line.label }}</span>
        <b>{{ line.value > 0 ? "¥" + line.value : "免费" }}</b>
      </div>
      <div class="is-due">
        <span>应付</span>
        <b>{{ money }}</b>
      </div>
    </section>

    <button v-if="wishEnrollmentId || order.wishToken" type="button" class="od-wish-entry" @click="goWish">
      <span class="od-wish-icon" aria-hidden="true"><WishGlyph kind="other" /></span>
      <span><strong>{{ t(order.wishToken ? '这一程的心意，收在这里' : '把这一程，写进心愿') }}</strong><small>{{ t(order.wishToken ? '查看心愿与朋友留下的心意' : '邀请朋友，为真实行程出一份心意') }}</small></span>
      <span class="od-wish-arrow" aria-hidden="true">↗</span>
    </button>

    <section class="od-card od-lines">
      <div><span>订单编号</span><b class="od-no">{{ no }} <button type="button" @click="copyNo">复制</button></b></div>
      <div v-if="placed"><span>下单时间</span><b>{{ placed }}</b></div>
      <div><span>支付方式</span><b>{{ payMethod }}</b></div>
      <div v-if="order.start_date"><span>出发日期</span><b>{{ order.start_date }}</b></div>
    </section>

    <section v-if="reviewOpen" class="od-card od-block">
      <div class="star-pick">
        <button v-for="n in 5" :key="n" type="button" :class="{ on: form.rating >= n }" @click="form.rating = n">★</button>
      </div>
      <textarea v-model="form.content" class="input" rows="3" placeholder="这次出行怎么样（选填）" />
      <button class="btn block" type="button" :disabled="submitting" @click="submitReview">提交评价</button>
    </section>

    <div v-if="hasActions" class="od-dock">
      <button v-if="order.canCancel" class="od-btn" type="button" :disabled="cancelling" @click="cancel">{{ order.status === "waitlist" ? "取消候补" : "取消报名" }}</button>
      <button v-if="order.canPay" class="od-btn solid" type="button" @click="goPay">去支付</button>
      <button v-if="canReview && !reviewOpen" class="od-btn solid" type="button" @click="reviewOpen = true">去评价</button>
      <button v-if="order.canAfter && order.completed" class="od-btn" type="button" @click="$router.push('/m/after/' + order.schedule_id)">评价 / 评选</button>
      <button v-if="again" class="od-btn" :class="{ solid: !canReview }" type="button" @click="$router.push('/m/route/' + order.route_id)">再次报名</button>
    </div>
    <p v-if="msg" class="muted">{{ msg }}</p>
  </div>
  <div v-else-if="err" class="card"><div class="pad">{{ err }}</div></div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import LoadRow from "@/components/LoadRow.vue";
import WishGlyph from "@/components/WishGlyph.vue";
import { readLook } from "@/utils/appearance";
import { translate } from "@/utils/locale";
import { isReviewTrip } from "@/utils/trips";
import { canReorder, maskTravelerPhone, orderBadge, orderHint, orderMoney, orderNo, orderShop, orderSpec, payMethodLabel, placedLabel, priceLines } from "@/utils/orderView";

const pageRoute = useRoute();
const router = useRouter();
const order = ref(null);
const err = ref("");
const ready = ref(false);
const msg = ref("");
const cancelling = ref(false);
const submitting = ref(false);
const reviewOpen = ref(false);
const form = ref({ rating: 5, content: "" });
const language = ref(readLook().lang);
const onLook = () => { language.value = readLook().lang; };
window.addEventListener("bj-look", onLook);
onBeforeUnmount(() => window.removeEventListener("bj-look", onLook));
function t(text) { return translate(text, language.value); }

const badge = computed(() => orderBadge(order.value));
const hint = computed(() => orderHint(order.value));
const shop = computed(() => orderShop(order.value));
const spec = computed(() => orderSpec(order.value));
const money = computed(() => orderMoney(order.value));
const prices = computed(() => priceLines(order.value));
const payMethod = computed(() => payMethodLabel(order.value));
const placed = computed(() => placedLabel(order.value));
const no = computed(() => orderNo(order.value));
const phone = computed(() => maskTravelerPhone(order.value?.traveler_phone));
const place = computed(() => order.value?.meetup_point || order.value?.city || orderSpec(order.value));
const canReview = computed(() => isReviewTrip(order.value));
const again = computed(() => canReorder(order.value));
const hasActions = computed(() => order.value && (order.value.canCancel || order.value.canPay || canReview.value || (order.value.canAfter && order.value.completed) || again.value));
const wishEnrollmentId = computed(() => {
  const item = order.value;
  if (item?.canLinkWish !== true) return 0;
  // GET /orders/:id is built from enrollments, so its own id is an enrollment id.
  const id = Number(item.enrollmentId ?? item.enrollment_id ?? item.id);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
});

onMounted(load);
watch(() => pageRoute.params.id, load);

async function load() {
  err.value = "";
  try {
    order.value = (await http.get("/orders/" + pageRoute.params.id)).data;
    reviewOpen.value = pageRoute.query.review === "1" && canReview.value;
  } catch (e) {
    order.value = null;
    err.value = e.message || "订单打不开";
  } finally {
    ready.value = true;
  }
}
function goPay() {
  if (order.value?.payShareToken) router.push("/m/pay/" + order.value.payShareToken);
}
function goWish() {
  if (order.value?.wishToken) { router.push("/m/wishes/" + encodeURIComponent(order.value.wishToken)); return; }
  if (wishEnrollmentId.value) router.push({ path: "/m/wishes/new", query: { kind: "trip", enrollmentId: String(wishEnrollmentId.value) } });
}
function goSchedule() {
  if (order.value?.schedule_id) router.push("/m/schedule/" + order.value.schedule_id);
}
async function copyNo() {
  try {
    await navigator.clipboard.writeText(no.value);
    msg.value = "已复制";
  } catch {
    msg.value = "复制失败";
  }
}
function cancelMessage() {
  const o = order.value;
  const deduct = Number(o && o.deductAmount) || 0;
  if (deduct > 0) {
    return `临近出发，取消将扣除 ${o.deductPercent}%（¥${deduct}），退回 ¥${Number(o.refundAmount) || 0}。确定取消报名？名额将释放给其他人。`;
  }
  if (o && o.refundHint) return `确定取消报名？${o.refundHint}。名额将释放给其他人。已付款按付款人原路退回。`;
  return "确定取消报名？名额将释放给其他人。已付款按付款人原路退回。";
}
async function cancel() {
  if (!window.confirm(cancelMessage())) return;
  cancelling.value = true;
  msg.value = "";
  try {
    await http.post(`/orders/${order.value.id}/cancel`);
    msg.value = "已取消报名";
    await load();
  } catch (e) {
    msg.value = e.message || "取消失败";
  } finally {
    cancelling.value = false;
  }
}
async function submitReview() {
  submitting.value = true;
  msg.value = "";
  try {
    await http.post("/reviews", { scheduleId: order.value.schedule_id, rating: form.value.rating, content: form.value.content });
    msg.value = "评价已提交";
    reviewOpen.value = false;
    await load();
  } catch (e) {
    msg.value = e.message || "评价失败";
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.od-wish-entry{display:flex;align-items:center;gap:13px;width:100%;margin:12px 0;padding:16px 17px;border:1px solid #e8dff0;border-radius:17px;background:#faf7fd;color:#5b3b8c;text-align:left;font:inherit;cursor:pointer;overflow-wrap:anywhere}.od-wish-entry>span:nth-child(2){flex:1;min-width:0}.od-wish-icon{width:35px;height:35px;flex:none}.od-wish-entry strong{display:block;font-size:calc(14px * var(--ui-scale,1));font-weight:600;line-height:1.6}.od-wish-entry small{display:block;font-size:calc(11px * var(--ui-scale,1));color:#93849f;line-height:1.7;margin-top:3px}.od-wish-arrow{font-size:24px;flex:none;color:#9c83bb}.od-wish-entry:focus-visible{outline:3px solid #b4a0d4;outline-offset:3px}:global(html[data-night="dark"] .od-wish-entry){background:#302838;border-color:#51405f;color:#d4b8ee}:global(html[data-night="dark"] .od-wish-entry small){color:#bba9ca}
</style>
