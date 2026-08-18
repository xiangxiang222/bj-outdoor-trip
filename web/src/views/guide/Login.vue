<template>
  <div class="mp-phone" style="padding:24px 16px">
    <h2>导游工作台</h2>
    <p class="muted">用登记手机号登录，查看已分配的团和名单。</p>
    <label>手机号</label>
    <input class="input" v-model="phone" maxlength="11" placeholder="13700001101" />
    <label>验证码</label>
    <div class="row">
      <input class="input" v-model="captcha" maxlength="4" placeholder="图片字符" style="flex:1;margin:0" />
      <img v-if="image" :src="image" alt="验证码" style="height:42px;margin-left:8px;border-radius:8px;cursor:pointer" @click="loadCap" />
    </div>
    <button class="btn block" style="margin-top:16px" @click="login">登录</button>
    <p class="muted">演示导游：林晓峰 13700001101</p>
    <p style="color:var(--clay)">{{ err }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";

const router = useRouter();
const phone = ref("13700001101");
const captcha = ref("");
const token = ref("");
const image = ref("");
const err = ref("");

onMounted(loadCap);
async function loadCap() {
  const res = await http.get("/auth/captcha", { params: { t: Date.now() } });
  token.value = res.data.token;
  image.value = res.data.image;
  captcha.value = "";
}
async function login() {
  err.value = "";
  try {
    const res = await http.post("/guide/login", { phone: phone.value, captchaToken: token.value, captcha: captcha.value });
    localStorage.setItem("bj_guide_token", res.data.token);
    localStorage.setItem("bj_guide_name", res.data.name || "");
    router.push("/g");
  } catch (e) {
    err.value = e.message;
    loadCap();
  }
}
</script>
