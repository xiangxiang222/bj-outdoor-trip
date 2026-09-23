<template>
  <div>
    <div class="card">
      <div class="pad">
        <p class="rule-title">可提现额度</p>
        <p class="muted">当前余额均可申请。单笔最低 1 元，最高 2000 元，须为整数元，且不超过账户余额。</p>
        <p v-if="loaded" class="muted">当前可提现 {{ available }} 元。</p>
        <p class="rule-title">每日提现次数</p>
        <p class="muted">每天最多 3 次。</p>
        <p v-if="loaded" class="muted">今日还可提现 {{ todayRemain }} 次。</p>
        <p class="rule-title">提现时间</p>
        <p class="muted">每天 00:00–23:59（北京时间），全天可申请。</p>
        <p class="rule-title">到账时间</p>
        <p class="muted">提交成功后实时转入微信零钱。如遇系统延迟，最迟 24 小时内到账。</p>
        <p class="rule-title">其他说明</p>
        <p class="muted">提现前须完成实名并设置 6 位支付密码。仅支持提现到本人微信零钱，不支持银行卡。</p>
        <button class="btn block" type="button" @click="$router.replace('/m/wallet')">去我的钱包</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { setChrome } from "@/utils/pageChrome";

const store = useUserStore();
const loaded = ref(false);
const available = ref(0);
const todayRemain = ref(3);

onMounted(async () => {
  setChrome("提现说明", "额度、次数与到账时间");
  if (!store.token) return;
  try {
    const data = (await http.get("/me/wallet")).data || {};
    const rule = data.withdrawRule || {};
    const balance = Number(data.balance || 0);
    available.value = rule.available != null ? rule.available : Math.min(balance, 2000);
    todayRemain.value = rule.todayRemain != null ? rule.todayRemain : 3;
    loaded.value = true;
  } catch {
    /* 规则文案不依赖接口 */
  }
});
</script>

<style scoped>
.rule-title { font-weight: 700; margin: 16px 0 4px; }
.rule-title:first-child { margin-top: 0; }
</style>
