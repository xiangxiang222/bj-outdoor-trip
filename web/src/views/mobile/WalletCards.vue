<template>
  <div>
    <div class="card">
      <div class="pad">
        <p class="rule-title">可提现额度</p>
        <p class="muted">当前账户余额全部可提现，不设最低提现金额。微信零钱按整数元记账。因微信商家转账到零钱单笔上限 2000 元，超过 2000 元时可连续分笔，每笔提交后立即处理。</p>
        <p v-if="loaded" class="muted">当前可提现 {{ available }} 元。</p>
        <p class="rule-title">每日提现次数</p>
        <p class="muted">不限制次数，可随时申请。</p>
        <p class="rule-title">提现时间</p>
        <p class="muted">每天 00:00–23:59（北京时间），全天可申请。</p>
        <p class="rule-title">到账时间</p>
        <p class="muted">提交成功后实时转入微信零钱。如遇系统延迟，最迟 24 小时内到账。</p>
        <p class="rule-title">其他说明</p>
        <p class="muted">微信支付转到零钱须完成实名并验证 6 位支付密码。仅支持提到本人微信零钱，不支持银行卡。充值进入的余额可按本规则全额提现。</p>
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

onMounted(async () => {
  setChrome("提现说明", "额度、次数与到账时间");
  if (!store.token) return;
  try {
    const data = (await http.get("/me/wallet")).data || {};
    const rule = data.withdrawRule || {};
    const balance = Number(data.balance || 0);
    available.value = rule.available != null ? Number(rule.available) : Math.min(balance, 2000);
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
