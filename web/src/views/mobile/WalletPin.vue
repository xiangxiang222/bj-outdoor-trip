<template>
  <div>
    <div class="card">
      <div class="pad">
        <p class="muted" style="margin-top:0">{{ data.pinSet ? "修改支付密码需验证原密码。忘记时可用身份证号重置。" : "设置 6 位数字支付密码后才能提现。" }}</p>
        <template v-if="data.pinSet">
          <label>原支付密码</label>
          <input class="input" v-model="oldPin" type="password" maxlength="6" inputmode="numeric" />
        </template>
        <label>{{ data.pinSet ? "新支付密码" : "支付密码" }}</label>
        <input class="input" v-model="pin" type="password" maxlength="6" inputmode="numeric" placeholder="6 位数字" />
        <label>再输入一次</label>
        <input class="input" v-model="pin2" type="password" maxlength="6" inputmode="numeric" />
        <button class="btn block" type="button" :disabled="busy" @click="save">{{ data.pinSet ? "修改密码" : "设置密码" }}</button>
      </div>
    </div>

    <div class="card" v-if="data.pinSet && data.realNamed">
      <div class="pad">
        <strong>找回密码</strong>
        <p class="muted">用实名身份证号重置 6 位支付密码。</p>
        <label>身份证号</label>
        <input class="input" v-model="idCard" maxlength="18" placeholder="与实名信息一致" />
        <label>新支付密码</label>
        <input class="input" v-model="resetPinValue" type="password" maxlength="6" inputmode="numeric" />
        <button class="btn ghost block" type="button" :disabled="busy" @click="reset">重置密码</button>
      </div>
    </div>
    <p v-if="msg" :style="ok ? '' : 'color:var(--clay)'">{{ msg }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { setChrome } from "@/utils/pageChrome";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const data = ref({ pinSet: false, realNamed: false });
const pin = ref("");
const pin2 = ref("");
const oldPin = ref("");
const idCard = ref("");
const resetPinValue = ref("");
const busy = ref(false);
const msg = ref("");
const ok = ref(false);

onMounted(async () => {
  setChrome("支付密码", "提现时使用");
  if (!requireLogin(store, router, route)) return;
  data.value = (await http.get("/me/wallet")).data || {};
});

async function save() {
  msg.value = "";
  ok.value = false;
  if (pin.value !== pin2.value) {
    msg.value = "两次密码不一致";
    return;
  }
  busy.value = true;
  try {
    await http.post("/me/wallet/pin", { pin: pin.value, oldPin: oldPin.value });
    ok.value = true;
    msg.value = "已保存";
    pin.value = "";
    pin2.value = "";
    oldPin.value = "";
    data.value = { ...data.value, pinSet: true };
  } catch (e) {
    msg.value = e.message || "保存失败";
  } finally {
    busy.value = false;
  }
}

async function reset() {
  msg.value = "";
  ok.value = false;
  busy.value = true;
  try {
    await http.post("/me/wallet/pin/reset", { idCard: idCard.value, pin: resetPinValue.value });
    ok.value = true;
    msg.value = "已重置";
    idCard.value = "";
    resetPinValue.value = "";
  } catch (e) {
    msg.value = e.message || "重置失败";
  } finally {
    busy.value = false;
  }
}
</script>
