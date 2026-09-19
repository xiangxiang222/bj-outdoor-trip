<template>
  <div>
    <div class="card">
      <div class="pad">
        <p style="margin-top:0">不再支持绑定银行卡。充值和提现都走微信，避免做成需要支付牌照的银行卡进出金。</p>
        <button class="btn block" type="button" @click="$router.replace('/m/wallet')">去我的钱包</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import { setChrome } from "@/utils/pageChrome";

onMounted(() => {
  setChrome("提现说明", "已改为微信零钱");
});
</script>
