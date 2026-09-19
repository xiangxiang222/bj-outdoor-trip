<template>
  <div>
    <p class="muted">根据法规要求，出行报名和提现需要核验身份。证件号仅本人可见，展示时脱敏。</p>
    <div class="cell-group">
      <div class="cell"><span>姓名</span><i>{{ store.profile?.nickname || "未填" }}</i></div>
      <div class="cell"><span>性别</span><i>{{ genderText(store.profile?.gender) || "待补充" }}</i></div>
      <div class="cell"><span>手机</span><i>{{ maskPhone(store.profile?.phone) }}</i></div>
      <div class="cell"><span>证件类型</span><i>身份证</i></div>
      <div class="cell"><span>证件号码</span><i>{{ store.profile?.idCardMasked || "待补充" }}</i></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="pad">
        <label>身份证号</label>
        <input class="input" v-model="idCard" maxlength="18" placeholder="18 位，末位数字或 X" />
        <p v-if="hint" class="muted" :style="okHint ? '' : 'color:var(--clay)'">{{ hint }}</p>
        <button class="btn block" type="button" :disabled="busy" @click="save">保存实名信息</button>
      </div>
    </div>
    <p v-if="msg" :style="ok ? '' : 'color:var(--clay)'">{{ msg }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
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
const busy = ref(false);
const msg = ref("");
const ok = ref(false);

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
  hint.value = "保存后用于提现核验，展示时脱敏。";
  okHint.value = true;
});

async function save() {
  msg.value = "";
  ok.value = false;
  busy.value = true;
  try {
    const res = await http.put("/me", { idCard: idCard.value });
    store.setAuth(store.token, res.data);
    ok.value = true;
    msg.value = "已保存";
    idCard.value = "";
  } catch (e) {
    msg.value = e.message || "保存失败";
  } finally {
    busy.value = false;
  }
}
</script>
