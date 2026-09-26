<template>
  <div>
    <div class="cell-label">{{ copy.look }}</div>
    <div class="cell-group">
      <label class="cell">
        <span>{{ copy.textMode }}</span>
        <input class="look-switch" type="checkbox" :checked="look.textMode" @change="toggleText" />
      </label>
      <button class="cell" type="button" @click="$router.push('/m/settings/font')">
        <span>{{ copy.font }}</span><i>›</i>
      </button>
      <button class="cell" type="button" @click="$router.push('/m/settings/night')">
        <span>{{ copy.night }}</span><i>{{ nightText }} ›</i>
      </button>
      <button class="cell" type="button" @click="$router.push('/m/settings/lang')">
        <span>{{ copy.lang }}</span><i>{{ langText }} ›</i>
      </button>
    </div>
    <div class="cell-group">
      <button class="cell" type="button" @click="$router.push('/m/profile')">
        <span>实名信息</span><i>{{ store.profile?.realNamed ? "已实名 ›" : "待完善 ›" }}</i>
      </button>
      <button class="cell" type="button" @click="$router.push('/m/wallet/pin')">
        <span>支付密码管理</span><i>{{ store.profile?.walletPinSet ? "已设置 ›" : "未设置 ›" }}</i>
      </button>
      <button class="cell" type="button" @click="$router.push('/m/wallet')">
        <span>我的钱包</span><i>余额 ¥{{ store.profile?.walletBalance || 0 }} ›</i>
      </button>
    </div>
    <button class="btn ghost block" style="margin-top:16px" type="button" @click="out">退出登录</button>
    <button class="btn ghost block" style="color:var(--clay);margin-top:8px" type="button" @click="closeAccount">注销账号</button>
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { setChrome } from "@/utils/pageChrome";
import { readLook, writeLook, t, nightLabel, langLabel } from "@/utils/appearance";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const look = readLook();
const copy = t(look);
const nightText = nightLabel(look);
const langText = langLabel(look);

function toggleText(e) {
  const next = writeLook({ textMode: e.target.checked });
  Object.assign(look, next);
}

onMounted(async () => {
  setChrome(copy.settingsTitle, copy.settingsSub);
  if (!requireLogin(store, router, route)) return;
  await store.fetchMe().catch(() => {});
});

function out() {
  store.logout();
  router.replace("/m/mine");
}

async function closeAccount() {
  if (!window.confirm("注销后账号信息将被删除，未出行的报名会取消。同一手机号可以重新注册。确定注销？")) return;
  try {
    await http.delete("/me");
    store.logout();
    router.replace("/m/mine");
  } catch (e) {
    window.alert(e.message || "注销失败");
  }
}
</script>
