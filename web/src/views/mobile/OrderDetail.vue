<template>
  <div class="od-page" v-if="order">
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
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { showAfterActions, todayYmd } from "@/utils/trips";
import { canReorder, maskTravelerPhone, orderBadge, orderHint, orderMoney, orderNo, orderShop, orderSpec, payMethodLabel, placedLabel, priceLines } from "@/utils/orderView";

const pageRoute = useRoute();
const router = useRouter();
const order = ref(null);
const err = ref("");
const msg = ref("");
const cancelling = ref(false);
const submitting = ref(false);
const reviewOpen = ref(false);
const form = ref({ rating: 5, content: "" });

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
const canReview = computed(() => showAfterActions(order.value) && order.value?.canReview && String(order.value?.start_date || "").slice(0, 10) < todayYmd());
const again = computed(() => canReorder(order.value));
const hasActions = computed(() => order.value && (order.value.canCancel || order.value.canPay || canReview.value || (order.value.canAfter && order.value.completed) || again.value));

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
  }
}
function goPay() {
  if (order.value?.payShareToken) router.push("/m/pay/" + order.value.payShareToken);
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
