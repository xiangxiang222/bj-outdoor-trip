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
      <button class="btn block" type="submit" :disabled="loading || capLoading">{{ loading ? '正在登录…' : '进入工作台' }}</button>
      <p class="guide-login-hint">看不清验证码？点击图片即可更换。<template v-if="demo"><br />本地演示：林晓峰 · 13700001101</template></p>
      <p v-if="err" class="guide-login-error" role="alert">{{ err }}</p>
    </form>
    <div class="guide-login-foot"><span>同行者众 · 专业带团服务</span><router-link to="/m">用户端 ↗</router-link></div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import "@/styles/operations.css";
const router = useRouter();
const demo = import.meta.env.DEV;
const phone = ref(demo ? "13700001101" : "");
const captcha = ref("");
const token = ref("");
const image = ref("");
const err = ref("");
const loading = ref(false);
const capLoading = ref(false);
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
  if (!token.value || !captcha.value.trim()) { err.value = "请填写图片验证码"; return; }
  loading.value = true;
  try {
    const res = await http.post("/guide/login", { phone: phone.value.trim(), captchaToken: token.value, captcha: captcha.value.trim() });
    localStorage.setItem("bj_guide_token", res.data.token);
    localStorage.setItem("bj_guide_name", res.data.name || "");
    router.push("/g");
  } catch (e) { err.value = e.message; await loadCap(); }
  finally { loading.value = false; }
}
</script>
