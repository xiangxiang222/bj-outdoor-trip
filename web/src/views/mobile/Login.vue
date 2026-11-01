<template>
  <div>
    <div class="chips">
      <div class="chip" :class="{ on: tab === 'login' }" @click="goLogin">登录</div>
      <div class="chip" :class="{ on: tab === 'register' }" @click="goRegister">注册</div>
    </div>

    <section class="login-legal" aria-label="登录协议">
      <p v-if="legalLoading" class="muted" role="status">正在加载协议…</p>
      <p v-else-if="legalError" class="login-legal-error" role="alert">{{ legalError }} <button type="button" @click="loadLegal">重新加载</button></p>
      <p v-else-if="legalBundle?.status === 'draft'" class="muted">{{ legalBundle.notice || '协议为审阅版，尚未正式生效。' }}</p>
      <label v-else-if="legalBundle?.status === 'published'" class="login-legal-check"><input v-model="legalAccepted" type="checkbox" />我已阅读并同意</label>
      <div class="login-legal-links"><button type="button" @click="openLegal('terms')">《用户协议》</button><button type="button" @click="openLegal('privacy')">《隐私政策》</button></div>
      <button class="login-legal-center" type="button" @click="openLegal('')">查看全部协议与信息清单 ›</button>
    </section>
    <div v-if="legalDoc !== null" class="login-legal-overlay" @click.self="closeLegal">
      <section class="login-legal-dialog" role="dialog" aria-modal="true" aria-label="协议与隐私" @keydown.esc="closeLegal">
        <div class="login-legal-toolbar"><strong>协议与隐私</strong><button ref="legalClose" type="button" @click="closeLegal">关闭</button></div>
        <div class="login-legal-body"><Legal :doc-id="legalDoc" @navigate="legalDoc = $event" /></div>
      </section>
    </div>

    <div class="card"><div class="pad">
      <template v-if="tab === 'login'">
        <div class="chips">
          <div class="chip" :class="{ on: loginMode === 'password' }" @click="loginMode = 'password'">密码登录</div>
          <div class="chip" :class="{ on: loginMode === 'sms' }" @click="loginMode = 'sms'">短信登录</div>
        </div>
        <label>手机号</label>
        <input class="input" v-model="phone" placeholder="请输入手机号" maxlength="11" />
        <template v-if="loginMode === 'sms'">
          <label>短信验证码</label>
          <div class="sms-row">
            <input class="input" v-model="smsCode" placeholder="6 位短信验证码" maxlength="6" autocomplete="one-time-code" />
            <button class="btn ghost" type="button" :disabled="smsWait > 0" @click="requestCode('login')">{{ smsWait ? smsWait + "秒" : "获取验证码" }}</button>
          </div>
          <p v-if="note" class="muted">{{ note }}</p>
          <button class="btn block" @click="loginSms">登录</button>
        </template>
        <template v-else>
          <label>密码</label>
          <input class="input" v-model="password" type="password" placeholder="请输入密码" />
          <label>验证码</label>
          <div class="captcha-box" @click="loadCaptcha">
            <img v-if="captchaImage" :src="captchaImage" alt="验证码" />
            <span v-else>{{ captchaLoading ? "加载中…" : "点击获取验证码" }}</span>
          </div>
          <input class="input" v-model="captcha" placeholder="请输入上图字符" maxlength="4" autocomplete="off" />
          <p class="muted">看不清请点击图片刷新</p>
          <button class="btn block" @click="loginPwd">登录</button>
        </template>
      </template>

      <template v-else>
        <label>昵称</label>
        <input class="input" v-model="nickname" placeholder="怎么称呼你" />
        <label>手机号</label>
        <input class="input" v-model="phone" placeholder="11 位手机号" maxlength="11" />
        <label>短信验证码</label>
        <div class="sms-row">
          <input class="input" v-model="smsCode" placeholder="6 位短信验证码" maxlength="6" autocomplete="one-time-code" />
          <button class="btn ghost" type="button" :disabled="smsWait > 0" @click="requestCode('register')">{{ smsWait ? smsWait + "秒" : "获取验证码" }}</button>
        </div>
        <p v-if="note" class="muted">{{ note }}</p>
        <label>设置密码</label>
        <input class="input" v-model="password" type="password" placeholder="至少 6 位" />
        <label>确认密码</label>
        <input class="input" v-model="password2" type="password" placeholder="再输入一次密码" />
        <button class="btn block" @click="register">注册</button>
      </template>
    </div></div>

    <p v-if="err" style="color:var(--clay)">{{ err }}</p>

    <div class="muted" style="text-align:center;margin:16px 0 8px">其他方式</div>
    <button class="btn ghost block" @click="wx">微信登录</button>
    <p class="muted" style="text-align:center;margin-top:12px" v-if="tab === 'login'">
      还没有账号？<a href="#" @click.prevent="goRegister" style="color:var(--leaf)">去注册</a>
    </p>
    <p class="muted" style="text-align:center;margin-top:12px" v-else>
      已有账号？<a href="#" @click.prevent="goLogin" style="color:var(--leaf)">去登录</a>
    </p>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { legalAuthPayload, legalGuardMessage, validateLegalBundle } from "@/utils/legal";
import Legal from "./Legal.vue";

const legalBundle = ref(null);
const legalLoading = ref(true);
const legalError = ref("");
const legalAccepted = ref(false);
const legalDoc = ref(null);
const legalClose = ref(null);
let legalPending = false;
let previousFocus = null;
async function openLegal(id) { previousFocus = window.document.activeElement; legalDoc.value = id; await nextTick(); legalClose.value?.focus(); }
function closeLegal() { legalDoc.value = null; previousFocus?.focus(); }
async function loadLegal() {
  if (legalPending) return;
  legalPending = true;
  legalLoading.value = true;
  legalBundle.value = null;
  legalAccepted.value = false;
  legalError.value = "";
  try { legalBundle.value = validateLegalBundle((await http.get("/legal")).data); }
  catch (e) { legalError.value = e.message || "协议加载失败，请重试"; }
  finally { legalPending = false; legalLoading.value = false; }
}
function checkLegal() {
  const message = legalGuardMessage(legalBundle.value, legalAccepted.value);
  if (message) { err.value = message; return false; }
  return true;
}
function legalPayload() { return legalAuthPayload(legalBundle.value, legalAccepted.value); }
async function handleLegalError(error) {
  if (!["legal_version_changed", "legal_version_conflict"].includes(error?.code)) return false;
  legalBundle.value = null;
  legalAccepted.value = false;
  if (error.code === "legal_version_changed") {
    await loadLegal();
    err.value = "协议已更新，请重新阅读并勾选同意";
  } else {
    legalLoading.value = false;
    legalError.value = "协议内容正在更新，请稍后重新加载";
    err.value = legalError.value;
  }
  return true;
}
const tab = ref("login");
const loginMode = ref("password");
const phone = ref("");
const smsCode = ref("");
const smsWait = ref(0);
const note = ref("");
const password = ref("");
const password2 = ref("");
const nickname = ref("");
const captcha = ref("");
const captchaToken = ref("");
const captchaImage = ref("");
const captchaLoading = ref(false);
const err = ref("");
let smsTimer = 0;
const route = useRoute();
const router = useRouter();
const store = useUserStore();
let captchaReq = 0;

onMounted(() => {
  loadLegal();
  if (route.query.tab === "register") goRegister();
  else loadCaptcha();
});

onUnmounted(() => clearInterval(smsTimer));

function goLogin() {
  tab.value = "login";
  err.value = "";
  note.value = "";
  loadCaptcha();
}

function goRegister() {
  tab.value = "register";
  password2.value = "";
  smsCode.value = "";
  err.value = "";
  note.value = "";
}

async function loadCaptcha() {
  const req = ++captchaReq;
  captchaLoading.value = true;
  captchaImage.value = "";
  try {
    const res = await http.get("/auth/captcha", { params: { t: Date.now() } });
    if (req !== captchaReq) return;
    captchaToken.value = res.data.token;
    captchaImage.value = res.data.image;
    captcha.value = "";
  } catch (e) {
    if (req !== captchaReq) return;
    err.value = e.message;
  } finally {
    if (req === captchaReq) captchaLoading.value = false;
  }
}

async function after(res) {
  store.setAuth(res.data.token, res.data.user);
  const redirect = route.query.redirect;
  if (typeof redirect === "string" && redirect.startsWith("/m")) router.replace(redirect);
  else router.replace("/m/mine");
}
async function requestCode(scene) {
  if (!checkLegal()) return;
  err.value = "";
  note.value = "";
  if (smsWait.value) return;
  if (!/^1\d{10}$/.test(phone.value || "")) {
    err.value = "手机号不正确";
    return;
  }
  try {
    const res = await http.post("/auth/sms", { phone: phone.value, scene, ...legalPayload() });
    note.value = res.message || "验证码已发送";
    smsWait.value = 60;
    clearInterval(smsTimer);
    smsTimer = setInterval(() => {
      smsWait.value -= 1;
      if (smsWait.value <= 0) clearInterval(smsTimer);
    }, 1000);
  } catch (e) {
    if (await handleLegalError(e)) return;
    err.value = e.message;
  }
}
async function loginSms() {
  if (!checkLegal()) return;
  err.value = "";
  if (!/^1\d{10}$/.test(phone.value || "")) {
    err.value = "手机号不正确";
    return;
  }
  if (!/^\d{6}$/.test(smsCode.value || "")) {
    err.value = "请填写短信验证码";
    return;
  }
  try {
    await after(await http.post("/auth/login-sms", { phone: phone.value, code: smsCode.value, ...legalPayload() }));
  } catch (e) {
    if (await handleLegalError(e)) return;
    err.value = e.message;
  }
}
async function loginPwd() {
  if (!checkLegal()) return;
  err.value = "";
  if (!captcha.value.trim()) {
    err.value = "请填写图片验证码";
    return;
  }
  try {
    await after(await http.post("/auth/login", {
      phone: phone.value,
      password: password.value,
      captchaToken: captchaToken.value,
      captcha: captcha.value.trim(),
      ...legalPayload(),
    }));
  } catch (e) {
    if (await handleLegalError(e)) return;
    err.value = e.message;
    loadCaptcha();
  }
}
async function register() {
  if (!checkLegal()) return;
  err.value = "";
  if (!nickname.value.trim()) {
    err.value = "请填写昵称";
    return;
  }
  if (!/^\d{6}$/.test(smsCode.value || "")) {
    err.value = "请填写短信验证码";
    return;
  }
  if (password.value !== password2.value) {
    err.value = "两次密码不一致";
    return;
  }
  try {
    await after(await http.post("/auth/register", {
      phone: phone.value,
      password: password.value,
      nickname: nickname.value.trim(),
      smsCode: smsCode.value,
      ...legalPayload(),
    }));
  } catch (e) {
    if (await handleLegalError(e)) return;
    err.value = e.message;
  }
}
async function wx() {
  if (!checkLegal()) return;
  err.value = "";
  try { await after(await http.post("/auth/wechat", { code: "demo_code", nickname: "微信游客", ...legalPayload() })); }
  catch (e) { if (!(await handleLegalError(e))) err.value = e.message; }
}
</script>

<style scoped>
.login-legal { padding: 16px 18px; margin: 16px 0; border: 1px solid var(--line, #e7e0eb); border-radius: 12px; background: var(--card, #fff); font-size: calc(13px * var(--ui-scale)); line-height: 1.9; }
.login-legal p { margin: 0 0 10px; }
.login-legal-check { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; cursor: pointer; }
.login-legal-check input { width: 18px; height: 18px; accent-color: #5b3b8c; }
.login-legal button { color: var(--leaf, #5b3b8c); border: 0; background: none; padding: 4px 0; font: inherit; cursor: pointer; text-align: left; }
.login-legal-links { display: flex; flex-wrap: wrap; gap: 12px; }
.login-legal-center { margin-top: 6px; }
.login-legal-error { color: var(--clay, #aa413f); }
.login-legal-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(25, 16, 33, .55); }
.login-legal-dialog { background: var(--bg, #f8f5fb); color: var(--ink); width: 760px; max-width: 100%; max-height: 90vh; display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 70px rgba(0, 0, 0, .2); }
.login-legal-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--line, #e7e0eb); }
.login-legal-toolbar button { font: inherit; border: 0; background: none; color: var(--leaf, #5b3b8c); padding: 8px; cursor: pointer; }
.login-legal-body { padding: 20px; overflow-y: auto; }
@media (max-width: 600px) { .login-legal-overlay { padding: 12px; } .login-legal-dialog { max-height: 94dvh; } }

.captcha-box {
  width: 100%;
  height: 52px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #f4efe6;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin: 6px 0 8px;
  overflow: hidden;
  color: var(--muted);
  font-size: calc(13px * var(--ui-scale));
}
.sms-row { display: flex; gap: 8px; align-items: center; }
.sms-row .input { flex: 1; margin: 0; }
.sms-row .btn { margin: 0; min-width: 112px; white-space: nowrap; }
.captcha-box img {
  height: 44px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
  display: block;
}
</style>
