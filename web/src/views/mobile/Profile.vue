<template>
  <div>
    <p class="muted">实名核验在微信小程序里完成：授权后核对姓名和身份证是否与这张微信的支付实名一致。网页不能代替这次授权。</p>
    <div class="cell-group">
      <div class="cell"><span>姓名</span><i>{{ store.profile?.nickname || "未填" }}</i></div>
      <div class="cell"><span>性别</span><i>{{ genderText(store.profile?.gender) || "待补充" }}</i></div>
      <div class="cell"><span>手机</span><i>{{ maskPhone(store.profile?.phone) }}</i></div>
      <div class="cell"><span>证件类型</span><i>身份证</i></div>
      <div class="cell"><span>证件号码</span><i>{{ store.profile?.idCardMasked || "待补充" }}</i></div>
      <div class="cell"><span>核验状态</span><i>{{ store.profile?.realNamed ? "已通过微信实名" : "待核验" }}</i></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="pad">
        <label>身份证号</label>
        <input class="input" v-model="idCard" maxlength="18" placeholder="18 位，末位数字或 X" />
        <p v-if="hint" class="muted" :style="okHint ? '' : 'color:var(--clay)'">{{ hint }}</p>
        <p class="muted">请打开同行者众小程序，在实名信息页完成微信授权。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { setChrome } from "@/utils/pageChrome";
import { genderText, maskPhone } from "@/utils/labels";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const idCard = ref("");
const hint = ref("");
const okHint = ref(true);

onMounted(async () => {
  setChrome("实名信息", "报名和提现用");
  if (!requireLogin(store, router, route)) return;
  await store.fetchMe().catch(() => {});
});

watch(idCard, (v) => {
  const raw = String(v || "").trim().toUpperCase();
  if (!raw) {
    hint.value = "";
    return;
  }
  if (!/^\d{17}[\dX]$/.test(raw)) {
    hint.value = "请填写 18 位身份证号";
    okHint.value = false;
    return;
  }
  hint.value = "号码格式正确。核验需要在小程序里授权微信。";
  okHint.value = true;
});
</script>
