<template>
  <div class="wallet-page">
    <template v-if="mode === 'done'">
      <div class="wal-done">
        <div class="wal-check">✓</div>
        <strong>{{ receipt.title }}</strong>
        <p class="muted">{{ receipt.hint }}</p>
        <div class="wal-slip">
          <div><span>金额</span><b>¥{{ receipt.amount }}</b></div>
          <div><span>方式</span><b>{{ receipt.method }}</b></div>
        </div>
        <button class="btn clay block" type="button" @click="backHome">完成</button>
        <button class="btn ghost block" type="button" @click="mode = 'records'">查看提现记录</button>
      </div>
    </template>

    <template v-else-if="mode === 'topup'">
      <div class="wal-banner">使用微信支付充值，成功后立即进入余额。</div>
      <div class="wal-panel">
        <div class="muted">充值金额</div>
        <div class="wal-amount"><small>¥</small><input v-model="topupAmount" inputmode="numeric" /></div>
        <p class="muted">1～5000 元，须为整数元。</p>
        <div class="wal-chips">
          <button v-for="n in quick" :key="n" type="button" :class="{ on: Number(topupAmount) === n }" @click="topupAmount = String(n)">{{ n }}</button>
        </div>
      </div>
      <button class="btn clay block" type="button" :disabled="busy" @click="topup">确认充值</button>
      <button class="btn ghost block" type="button" @click="backHome">返回</button>
    </template>

    <template v-else-if="mode === 'withdraw'">
      <div class="wal-banner">提到本人微信零钱。提交后在微信里确认收款，确认后到账。不支持银行卡。</div>
      <div class="wal-panel">
        <div class="wal-line">
          <span>到账方式</span>
          <b>微信零钱</b>
        </div>
        <div class="muted">提现金额</div>
        <div class="wal-amount">
          <small>¥</small>
          <input v-model="withdrawAmount" inputmode="numeric" />
          <button type="button" class="wal-all" @click="fillAll">全部提现</button>
        </div>
        <p class="muted">可提现 {{ rule.available }} 元。单笔上限 2000 元，不限次数。</p>
        <p v-if="!data.pinSet" class="muted">请先<a href="#" @click.prevent="router.push('/m/wallet/pin')">设置 6 位支付密码</a>。</p>
      </div>
      <button class="btn clay block" type="button" :disabled="busy" @click="askPin">提现</button>
      <button class="btn ghost block" type="button" @click="backHome">返回</button>
    </template>

    <template v-else-if="mode === 'records'">
      <div class="wal-tabs">
        <button type="button" :class="{ on: recordTab === 'success' }" @click="recordTab = 'success'">提现成功</button>
        <button type="button" :class="{ on: recordTab === 'processing' }" @click="recordTab = 'processing'">处理中</button>
        <button type="button" :class="{ on: recordTab === 'failed' }" @click="recordTab = 'failed'">提现失败</button>
      </div>
      <template v-if="recordGroups.length">
        <section v-for="group in recordGroups" :key="group.key">
          <p class="cell-label">{{ group.label }}</p>
          <div class="cell-group">
            <div class="cell" v-for="item in group.items" :key="item.id">
              <span>{{ item.title }}<small class="muted">{{ item.createdAt }}</small></span>
              <i>-{{ item.amount }}</i>
            </div>
          </div>
        </section>
      </template>
      <div v-else class="wal-empty">
        <strong>没有相关记录</strong>
        <p class="muted">更多进出账在余额明细里。</p>
      </div>
      <button class="btn ghost block" type="button" @click="backHome">返回</button>
    </template>

    <template v-else>
      <div class="wal-card">
        <div class="muted">可用余额（元）</div>
        <div class="wal-balance">{{ data.balance || 0 }}</div>
        <div class="wal-actions">
          <button class="btn ghost" type="button" @click="openWithdraw">提现</button>
          <button class="btn clay" type="button" @click="openTopup">充值</button>
        </div>
      </div>

      <p class="cell-label">余额明细</p>
      <div class="cell-group" v-if="shownBills.length">
        <div class="cell" v-for="b in shownBills" :key="b.id">
          <span>{{ b.reason }}<small class="muted">{{ b.createdAt }}</small></span>
          <i :class="b.delta > 0 ? 'in' : ''">{{ b.delta > 0 ? "+" : "" }}{{ b.delta }}</i>
        </div>
      </div>
      <p v-else class="muted wal-note">还没有余额明细。</p>
      <button v-if="(data.bills || []).length > shownBills.length" class="wal-more" type="button" @click="showAllBills = true">查看更多</button>

      <div class="cell-group" style="margin-top:12px">
        <button class="cell" type="button" @click="router.push('/m/wallet/pin')">
          <span>支付密码</span><i>{{ data.pinSet ? "已设置 ›" : "未设置 ›" }}</i>
        </button>
        <button class="cell" type="button" @click="mode = 'records'">
          <span>提现记录</span><i>›</i>
        </button>
        <button class="cell" type="button" @click="router.push('/m/profile')">
          <span>实名信息</span><i>{{ data.realNamed ? "已实名 ›" : "选填 ›" }}</i>
        </button>
      </div>

      <p class="cell-label">常见问题</p>
      <section v-for="group in faqs" :key="group.title">
        <p class="wal-faq-label">{{ group.title }}</p>
        <div class="cell-group">
          <button v-for="item in group.items" :key="item.q" class="cell wal-faq" type="button" @click="toggleFaq(item.q)">
            <span>
              {{ item.q }}
              <small v-if="openFaq === item.q" class="muted">{{ item.a }}</small>
            </span>
            <i>{{ openFaq === item.q ? "⌃" : "›" }}</i>
          </button>
        </div>
      </section>
    </template>

    <p v-if="msg" class="wal-msg" :class="{ ok }">{{ msg }}</p>

    <div v-if="pinOpen" class="wal-mask" @click.self="pinOpen = false">
      <div class="wal-pad">
        <div class="wal-pad-head">
          <strong>请输入支付密码</strong>
          <button type="button" @click="pinOpen = false">×</button>
        </div>
        <div class="wal-dots">
          <i v-for="n in 6" :key="n" :class="{ on: pin.length >= n }"></i>
        </div>
        <button class="wal-forget" type="button" @click="router.push('/m/wallet/pin')">忘记密码</button>
        <div class="wal-keys">
          <button
            v-for="key in keys"
            :key="key.label"
            type="button"
            :disabled="!key.label"
            :class="{ down: downKey === key.label }"
            @pointerdown="downKey = key.label"
            @pointerup="downKey = ''"
            @pointercancel="downKey = ''"
            @pointerleave="downKey = ''"
            @click="pressKey(key)"
          >{{ key.label }}</button>
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
import { setChrome } from "@/utils/pageChrome";
import { liveWechatPay, MINIPROGRAM_PAY_HINT } from "@/utils/wechatPay";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const data = ref({ bills: [], withdrawals: [] });
const rule = ref({ available: 0 });
const mode = ref("");
const topupAmount = ref("100");
const withdrawAmount = ref("");
const pin = ref("");
const pinOpen = ref(false);
const downKey = ref("");
const busy = ref(false);
const msg = ref("");
const ok = ref(false);
const showAllBills = ref(false);
const openFaq = ref("");
const recordTab = ref("success");
const receipt = ref({ title: "", hint: "", amount: 0, method: "" });
const quick = [50, 100, 200, 500];
const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((label) => ({ label: String(label) }));
const faqs = [
  {
    title: "使用规则",
    items: [
      { q: "余额怎么用", a: "余额用来支付团费。不用时可以提到本人微信零钱。" },
      { q: "能不能提到银行卡", a: "不能。只支持提到本人微信零钱，不绑银行卡。" },
    ],
  },
  {
    title: "提现问题",
    items: [
      { q: "提现要什么", a: "要先设置 6 位支付密码。不要求实名。提交后在微信里确认收款，确认后余额才扣。" },
      { q: "多久到账、有没有限额", a: "确认收款后实时到账，延迟最迟 24 小时。不限次数，单笔最多 2000 元，超出可马上再提一笔。" },
    ],
  },
  {
    title: "充值问题",
    items: [
      { q: "怎么充值", a: "使用微信支付。单笔 1～5000 元，须为整数元，支付成功后立即进入余额。" },
    ],
  },
];

const shownBills = computed(() => (showAllBills.value ? data.value.bills || [] : (data.value.bills || []).slice(0, 6)));
const recordGroups = computed(() => {
  const rows = (data.value.withdrawals || []).filter((item) => item.status === recordTab.value);
  const map = new Map();
  rows.forEach((item) => {
    const key = String(item.createdAt || "").slice(0, 7) || "更早";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return [...map.entries()].map(([key, items]) => ({
    key,
    label: /^\d{4}-\d{2}$/.test(key) ? `${key.slice(0, 4)}年${Number(key.slice(5))}月` : key,
    items,
  }));
});

onMounted(async () => {
  setChrome("我的钱包", "充值、提现到微信零钱");
  if (!requireLogin(store, router, route)) return;
  await load();
});

async function load() {
  data.value = (await http.get("/me/wallet")).data || { bills: [], withdrawals: [] };
  const got = data.value.withdrawRule || {};
  const balance = Number(data.value.balance || 0);
  rule.value = { available: got.available != null ? Number(got.available) : Math.min(balance, 2000) };
  if (store.profile) {
    store.setAuth(store.token, { ...store.profile, walletBalance: data.value.balance, walletPinSet: data.value.pinSet });
  }
}

function backHome() {
  mode.value = "";
  msg.value = "";
  setChrome("我的钱包", "充值、提现到微信零钱");
}
function openTopup() {
  mode.value = "topup";
  msg.value = "";
  setChrome("余额充值", "");
}
function openWithdraw() {
  mode.value = "withdraw";
  msg.value = "";
  const available = Number(rule.value.available || 0);
  if (available > 0) withdrawAmount.value = String(available);
  setChrome("余额提现", "");
}
function fillAll() {
  const available = Number(rule.value.available || 0);
  if (available > 0) withdrawAmount.value = String(available);
}
function toggleFaq(q) {
  openFaq.value = openFaq.value === q ? "" : q;
}
function askPin() {
  msg.value = "";
  if (!data.value.pinSet) {
    router.push("/m/wallet/pin");
    return;
  }
  pin.value = "";
  pinOpen.value = true;
}
function pressKey(key) {
  if (!key.label || busy.value) return;
  if (key.label === "⌫") {
    pin.value = pin.value.slice(0, -1);
    return;
  }
  if (pin.value.length >= 6) return;
  pin.value += key.label;
  if (pin.value.length === 6) doWithdraw();
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
    receipt.value = {
      title: "充值成功",
      hint: "余额已更新，可以用来付团费。",
      amount: res.data.amount || topupAmount.value,
      method: "微信支付",
    };
    mode.value = "done";
    setChrome("充值成功", "");
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
    if (res.data.user) store.setAuth(store.token, res.data.user);
    const waiting = Boolean(res.data.needConfirm);
    receipt.value = {
      title: waiting ? "提现已提交" : "提现成功",
      hint: waiting ? "请打开微信小程序确认收款，确认后余额才会扣。" : "已转到微信零钱。",
      amount: res.data.amount,
      method: "微信零钱",
    };
    pinOpen.value = false;
    pin.value = "";
    mode.value = "done";
    setChrome(receipt.value.title, "");
    await load();
  } catch (e) {
    pin.value = "";
    msg.value = e.message || "提现失败";
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.wallet-page { padding-bottom: 24px; }
.wal-card, .wal-panel, .wal-slip { background: #fff; border-radius: 16px; padding: 20px 16px; margin-bottom: 12px; }
.wal-balance { font-size: calc(48px * var(--ui-scale)); font-weight: 700; line-height: 1.1; letter-spacing: -1px; }
.wal-actions { display: flex; gap: 12px; margin-top: 20px; }
.wal-actions .btn { flex: 1; border-radius: 999px; }
.wal-banner { background: #f8f1e7; color: #8a5a2a; border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; line-height: 1.5; }
.wal-amount { display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #eee; margin: 8px 0 10px; }
.wal-amount small { font-size: calc(28px * var(--ui-scale)); font-weight: 700; }
.wal-amount input { flex: 1; border: 0; background: transparent; font: inherit; font-size: calc(36px * var(--ui-scale)); font-weight: 700; width: 100%; outline: none; }
.wal-all { border: 0; background: transparent; color: var(--pku); font: inherit; }
.wal-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.wal-chips button { border: 0; background: #f3f4f6; border-radius: 999px; padding: 8px 14px; font: inherit; }
.wal-chips button.on { background: #f3e8ea; color: var(--pku); }
.wal-line { display: flex; justify-content: space-between; margin-bottom: 16px; }
.wal-note { margin: 0 4px 8px; }
.wal-more, .wal-forget { border: 0; background: transparent; color: var(--pku); font: inherit; display: block; margin: 8px auto; }
.cell small { display: block; font-weight: 400; }
.cell i.in { color: var(--pku); font-style: normal; }
.wal-faq { text-align: left; }
.wal-faq small { margin-top: 8px; line-height: 1.5; }
.wal-faq-label { margin: 14px 4px 6px; color: #9a9a9a; font-size: calc(13px * var(--ui-scale)); }
.wal-tabs { display: flex; gap: 8px; margin-bottom: 8px; }
.wal-tabs button { border: 0; background: #fff; border-radius: 999px; padding: 8px 12px; font: inherit; }
.wal-tabs button.on { background: #f3e8ea; color: var(--pku); }
.wal-empty { text-align: center; padding: 48px 16px; }
.wal-done { text-align: center; padding-top: 28px; }
.wal-check { width: 64px; height: 64px; margin: 0 auto 12px; border-radius: 50%; background: var(--pku); color: #fff; font-size: 32px; line-height: 64px; }
.wal-slip { text-align: left; }
.wal-slip div { display: flex; justify-content: space-between; padding: 8px 0; }
.wal-msg { margin-top: 12px; }
.wal-msg.ok { color: var(--leaf); }
.wal-msg:not(.ok) { color: var(--clay); }
.wal-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 30; display: flex; align-items: flex-end; }
.wal-pad { width: 100%; background: #f3f4f6; border-radius: 16px 16px 0 0; padding: 16px 16px 24px; }
.wal-pad-head { display: flex; justify-content: space-between; align-items: center; }
.wal-pad-head button { border: 0; background: transparent; font-size: 24px; }
.wal-dots { display: flex; justify-content: center; gap: 10px; margin: 16px 0 8px; }
.wal-dots i { width: 36px; height: 44px; border-radius: 8px; background: #fff; display: block; position: relative; }
.wal-dots i.on::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #222; position: absolute; left: 14px; top: 18px; }
.wal-keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.wal-keys button {
  height: 52px;
  border: 0;
  border-radius: 8px;
  background: #fff;
  font-size: calc(22px * var(--ui-scale));
  box-shadow: 0 1px 0 rgba(20, 20, 20, 0.06);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.wal-keys button.down,
.wal-keys button:active:not(:disabled) {
  background: #d2d2d7;
  box-shadow: inset 0 2px 6px rgba(20, 20, 20, 0.18);
}
.wal-keys button:disabled { background: transparent; box-shadow: none; }
.btn.block { margin-top: 12px; }
</style>
