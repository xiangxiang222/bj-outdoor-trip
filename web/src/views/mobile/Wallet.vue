<template>
  <div>
    <div class="wallet-hero">
      <div class="muted">账户安全保障中</div>
      <div class="wallet-balance">{{ data.balance || 0 }}<small>元</small></div>
      <p class="muted">返点、成团奖励会进这里。充值走微信支付，提现到微信零钱，可直接付团费。不支持银行卡。</p>
      <div class="wallet-actions">
        <button class="btn" type="button" @click="mode = mode === 'topup' ? '' : 'topup'">微信支付充值</button>
        <button class="btn ghost" type="button" @click="mode = mode === 'withdraw' ? '' : 'withdraw'">提现到微信</button>
      </div>
    </div>

    <div v-if="mode === 'topup'" class="card">
      <div class="pad">
        <label>充值金额（元）</label>
        <input class="input" v-model="topupAmount" type="number" min="1" max="5000" placeholder="1～5000" />
        <div class="chips" style="padding-left:0">
          <div class="chip" v-for="n in [50, 100, 200, 500]" :key="n" :class="{ on: Number(topupAmount) === n }" @click="topupAmount = String(n)">{{ n }}</div>
        </div>
        <button class="btn block" type="button" :disabled="busy" @click="topup">确认微信支付</button>
      </div>
    </div>

    <div v-if="mode === 'withdraw'" class="card">
      <div class="pad">
        <p v-if="!data.realNamed" class="muted">提现前请先<a href="#" @click.prevent="$router.push('/m/profile')">完成实名</a></p>
        <p v-else-if="!data.pinSet" class="muted">请先<a href="#" @click.prevent="$router.push('/m/wallet/pin')">设置支付密码</a></p>
        <template v-else>
          <label>提现金额（元）</label>
          <input class="input" v-model="withdrawAmount" type="number" min="1" :max="data.balance" />
          <p class="muted">到账微信零钱。演示环境立即记账；正式环境需开通商家转账。</p>
          <label>支付密码</label>
          <input class="input" v-model="pin" type="password" maxlength="6" inputmode="numeric" placeholder="6 位数字" />
          <button class="btn block" type="button" :disabled="busy" @click="doWithdraw">确认提现到微信</button>
        </template>
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
    <p v-else class="muted">还没有钱包流水。分享报名返点、成团奖励会记在这里。</p>
    <p v-if="msg" :style="ok ? '' : 'color:var(--clay)'">{{ msg }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
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
const mode = ref("");
const topupAmount = ref("100");
const withdrawAmount = ref("");
const pin = ref("");
const busy = ref(false);
const msg = ref("");
const ok = ref(false);

onMounted(async () => {
  setChrome("我的钱包", "微信充值、提现到零钱");
  if (!requireLogin(store, router, route)) return;
  await load();
});

async function load() {
  data.value = (await http.get("/me/wallet")).data || { bills: [] };
  if (store.profile) {
    store.setAuth(store.token, { ...store.profile, walletBalance: data.value.balance, walletPinSet: data.value.pinSet });
  }
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
