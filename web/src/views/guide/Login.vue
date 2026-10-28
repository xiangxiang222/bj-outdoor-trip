<template>
  <div class="guide-login">
    <section class="guide-login-hero">
      <router-link to="/m" class="guide-brand"><img src="/brand/mark.png" alt="" /><span><strong>同行者众</strong><small>在山野，遇见爱</small></span></router-link>
      <h1>带着热爱，一起出发。</h1><p>把每一段山野，变成一段放心的旅程。</p>
    </section>
    <form class="guide-login-form" @submit.prevent="login">
      <span class="ops-eyebrow">YOUR JOURNEY STARTS HERE</span><h2>导游工作台</h2><p>使用已登记的手机号登录，查看行程与出行名单。</p>
      <label for="guide-phone">登记手机号</label><input id="guide-phone" class="input" v-model="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="11" placeholder="请输入 11 位手机号" />
      <label for="guide-captcha">图片验证码</label><div class="guide-captcha-row"><input id="guide-captcha" class="input" v-model="captcha" maxlength="4" placeholder="输入右侧字符" autocomplete="off" /><button class="guide-captcha-button" type="button" :disabled="capLoading" aria-label="更换图片验证码" @click="loadCap"><img v-if="image" :src="image" alt="图片验证码" /><span v-else>{{ capLoading ? '加载中' : '重新获取' }}</span></button></div>
      <label for="guide-sms">短信验证码</label><div class="guide-captcha-row"><input id="guide-sms" class="input" v-model="smsCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="输入短信验证码" /><button class="guide-captcha-button guide-sms-button" type="button" :disabled="smsLoading || smsCooldown > 0" @click="sendSms">{{ smsCooldown ? `${smsCooldown} 秒后重试` : smsLoading ? '发送中…' : '获取验证码' }}</button></div>
      <button class="btn block" type="submit" :disabled="loading || smsLoading">{{ loading ? '正在登录…' : '进入工作台' }}</button>
      <p class="guide-login-hint">看不清验证码？点击图片即可更换。<template v-if="demo"><br />本地演示：林晓峰 · 13700001101</template></p>
      <p v-if="err" class="guide-login-error" role="alert">{{ err }}</p>
      <p v-if="notice" class="guide-login-hint" role="status">{{ notice }}</p>
    </form>
    <div class="guide-login-foot"><span>同行者众 · 专业带团服务</span><router-link to="/m">用户端 ↗</router-link></div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import "@/styles/operations.css";
const router = useRouter();
const demo = import.meta.env.DEV;
const phone = ref(demo ? "13700001101" : "");
const captcha = ref("");
const smsCode = ref("");
const token = ref("");
const image = ref("");
const err = ref("");
const notice = ref("");
const loading = ref(false);
const capLoading = ref(false);
const smsLoading = ref(false);
const smsCooldown = ref(0);
let smsTimer;
onBeforeUnmount(() => clearInterval(smsTimer));
onMounted(loadCap);
async function loadCap() {
  if (capLoading.value) return;
  capLoading.value = true;
  try {
    const res = await http.get("/auth/captcha", { params: { t: Date.now() } });
    token.value = res.data.token;
    image.value = res.data.image;
    captcha.value = "";
  } catch (e) { err.value = e.message || "验证码加载失败，请点击重新获取"; }
  finally { capLoading.value = false; }
}
async function login() {
  if (loading.value) return;
  err.value = "";
  if (!/^1\d{10}$/.test(phone.value.trim())) { err.value = "请填写有效的 11 位手机号"; return; }
  if (!/^\d{6}$/.test(smsCode.value.trim())) { err.value = "请填写 6 位短信验证码"; return; }
  loading.value = true;
  try {
    const res = await http.post("/guide/login", { phone: phone.value.trim(), code: smsCode.value.trim() });
    localStorage.setItem("bj_guide_token", res.data.token);
    localStorage.setItem("bj_guide_name", res.data.name || "");
    router.push("/g");
  } catch (e) { err.value = e.message; }
  finally { loading.value = false; }
}
async function sendSms() {
  if (smsLoading.value || smsCooldown.value > 0) return;
  err.value = "";
  notice.value = "";
  if (!/^1\d{10}$/.test(phone.value.trim())) { err.value = "请先填写有效的 11 位手机号"; return; }
  if (!token.value || !captcha.value.trim()) { err.value = "请先填写图片验证码"; return; }
  smsLoading.value = true;
  try {
    const res = await http.post("/auth/sms", { phone: phone.value.trim(), scene: "guide", captchaToken: token.value, captcha: captcha.value.trim() });
    smsCode.value = "";
    smsCooldown.value = 60;
    clearInterval(smsTimer);
    smsTimer = setInterval(() => {
      smsCooldown.value = Math.max(0, smsCooldown.value - 1);
      if (!smsCooldown.value) clearInterval(smsTimer);
    }, 1000);
    notice.value = res.message === "演示环境验证码为 888888" ? "演示环境验证码为 888888" : "验证码已发送";
    await loadCap();
  } catch (e) { err.value = e.message || "验证码发送失败"; await loadCap(); }
  finally { smsLoading.value = false; }
}
</script>
