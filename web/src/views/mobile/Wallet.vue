<template>
  <div>
    <div class="wallet-hero">
      <div class="muted">账户安全保障中</div>
      <div class="wallet-balance">{{ data.balance || 0 }}<small>元</small></div>
      <p class="muted">充值走微信支付，提现到微信零钱，可直接付团费。不支持银行卡。</p>
      <div class="wallet-actions">
        <button class="btn" type="button" @click="showTopup">微信支付充值</button>
        <button class="btn ghost" type="button" @click="showWithdraw">提现到微信</button>
      </div>
    </div>

    <div v-if="mode === 'topup'" class="card" ref="topupBox">
      <div class="pad">
        <label>充值金额（元）</label>
        <input class="input" v-model="topupAmount" type="number" min="1" max="5000" placeholder="1～5000" />
        <div class="chips" style="padding-left:0">
          <div class="chip" v-for="n in [50, 100, 200, 500]" :key="n" :class="{ on: Number(topupAmount) === n }" @click="topupAmount = String(n)">{{ n }}</div>
        </div>
        <p class="muted">单笔 1～5000 元。支付成功后立即进入余额，用于支付团费。请确认金额后再支付。</p>
        <button class="btn block" type="button" :disabled="busy" @click="topup">确认微信支付</button>
      </div>
    </div>

    <div v-if="mode === 'withdraw'" class="card" ref="withdrawBox">
      <div class="pad">
        <p v-if="!data.realNamed" class="muted">微信支付转到零钱须先<a href="#" @click.prevent="$router.push('/m/profile')">完成实名</a>后再提交。</p>
        <p v-if="data.realNamed && !data.pinSet" class="muted">请先<a href="#" @click.prevent="$router.push('/m/wallet/pin')">设置 6 位支付密码</a>，再提交提现。</p>
        <label>提现金额（元）</label>
        <input class="input" v-model="withdrawAmount" type="number" min="0" :max="rule.available" />
        <div v-if="rule.available > 0" class="chips" style="padding-left:0">
          <div class="chip on" @click="fillAll">全部提现 {{ rule.available }} 元</div>
        </div>
        <p class="muted">当前余额全部可提，不设最低金额。微信转账单笔上限 2000 元，超出可立即再提。提交后实时到账微信零钱，最迟 24 小时。</p>
        <label>支付密码</label>
        <input class="input" v-model="pin" type="password" maxlength="6" inputmode="numeric" placeholder="6 位数字" />
        <button class="btn block" type="button" :disabled="busy" @click="doWithdraw">确认提现到微信</button>
      </div>
    </div>

    <div class="card">
      <div class="pad">
        <p class="rule-title">提现规则</p>
        <p class="rule-title">可提现额度</p>
        <p class="muted">当前账户余额全部可提现，不设最低提现金额。微信零钱按整数元记账。因微信商家转账到零钱单笔上限 2000 元，超过 2000 元时可连续分笔，每笔提交后立即处理。当前可提现 {{ rule.available }} 元。</p>
        <p class="rule-title">每日提现次数</p>
        <p class="muted">不限制次数，可随时申请。</p>
        <p class="rule-title">提现时间</p>
        <p class="muted">每天 00:00–23:59（北京时间），全天可申请。</p>
        <p class="rule-title">到账时间</p>
        <p class="muted">提交成功后实时转入微信零钱。如遇系统延迟，最迟 24 小时内到账。</p>
        <p class="muted">微信支付转到零钱须完成实名并验证 6 位支付密码。仅支持提到本人微信零钱，不支持银行卡。充值进入的余额可按本规则全额提现。</p>
        <p class="rule-title">充值规则</p>
        <p class="rule-title">单笔额度</p>
        <p class="muted">1～5000 元，须为整数元。</p>
        <p class="rule-title">到账时间</p>
        <p class="muted">微信支付成功后立即进入余额。</p>
        <p class="rule-title">用途</p>
        <p class="muted">余额用于支付团费。不用时按上方提现规则转到微信零钱。不支持银行卡。</p>
      </div>
    </div>

    <div class="cell-group">
      <button class="cell" type="button" @click="$router.push('/m/wallet/pin')">
        <span>支付密码</span><i>{{ data.pinSet ? "已设置 ›" : "未设置 ›" }}</i>
      </button>
      <button class="cell" type="button" @click="$router.push('/m/profile')">
        <span>实名信息</span><i>{{ data.realNamed ? "已实名 ›" : "待完善 ›" }}</i>
      </button>
    </div>

    <p class="cell-label">账单</p>
    <div class="cell-group" v-if="data.bills?.length">
      <div class="cell" v-for="b in data.bills" :key="b.id">
        <span>
          {{ b.reason }}
          <small class="muted" style="display:block;font-weight:400">{{ b.createdAt }}</small>
        </span>
        <i :style="{ color: b.delta > 0 ? 'var(--leaf)' : 'inherit' }">{{ b.delta > 0 ? "+" : "" }}{{ b.delta }}</i>
      </div>
    </div>
    <p v-else class="muted">还没有钱包流水。</p>
    <p v-if="msg" :style="ok ? '' : 'color:var(--clay)'">{{ msg }}</p>
  </div>
</template>

<style scoped>
.rule-title { font-weight: 700; margin: 16px 0 4px; }
.rule-title:first-child { margin-top: 0; font-size: calc(16px * var(--ui-scale)); }
</style>

<script setup>
import { nextTick, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { setChrome } from "@/utils/pageChrome";
import { liveWechatPay, MINIPROGRAM_PAY_HINT } from "@/utils/wechatPay";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const data = ref({ bills: [] });
const rule = ref({ available: 0 });
const mode = ref("");
const topupAmount = ref("100");
const withdrawAmount = ref("");
const pin = ref("");
const busy = ref(false);
const msg = ref("");
const ok = ref(false);
const withdrawBox = ref(null);
const topupBox = ref(null);

onMounted(async () => {
  setChrome("我的钱包", "微信充值、提现到零钱");
  if (!requireLogin(store, router, route)) return;
  await load();
});

async function load() {
  data.value = (await http.get("/me/wallet")).data || { bills: [] };
  const got = data.value.withdrawRule || {};
  const balance = Number(data.value.balance || 0);
  rule.value = {
    available: got.available != null ? Number(got.available) : Math.min(balance, 2000),
  };
  if (store.profile) {
    store.setAuth(store.token, { ...store.profile, walletBalance: data.value.balance, walletPinSet: data.value.pinSet });
  }
}

function showTopup() {
  if (mode.value === "topup") {
    mode.value = "";
    return;
  }
  mode.value = "topup";
  nextTick(() => topupBox.value?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
}

function showWithdraw() {
  if (mode.value === "withdraw") {
    mode.value = "";
    return;
  }
  mode.value = "withdraw";
  const available = Number(rule.value.available || 0);
  if (available > 0) withdrawAmount.value = String(available);
  nextTick(() => withdrawBox.value?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
}

function fillAll() {
  const available = Number(rule.value.available || 0);
  if (available > 0) withdrawAmount.value = String(available);
}

async function topup() {
  msg.value = "";
  ok.value = false;
  busy.value = true;
  try {
    const res = await http.post("/me/wallet/topup", { amount: Number(topupAmount.value) });
    if (liveWechatPay(res.data)) {
      msg.value = MINIPROGRAM_PAY_HINT;
      return;
    }
    store.setAuth(store.token, res.data.user);
    ok.value = true;
    msg.value = "已用微信支付充值 ¥" + (res.data.amount || topupAmount.value);
    mode.value = "";
    await load();
  } catch (e) {
    msg.value = e.message || "充值失败";
  } finally {
    busy.value = false;
  }
}

async function doWithdraw() {
  msg.value = "";
  ok.value = false;
  busy.value = true;
  try {
    const res = await http.post("/me/wallet/withdraw", {
      amount: Number(withdrawAmount.value),
      pin: pin.value,
    });
    store.setAuth(store.token, res.data.user);
    ok.value = true;
    msg.value = "已提现 ¥" + res.data.amount + " 到微信零钱";
    pin.value = "";
    mode.value = "";
    await load();
  } catch (e) {
    msg.value = e.message || "提现失败";
  } finally {
    busy.value = false;
  }
}
</script>
