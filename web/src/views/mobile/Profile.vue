<template>
  <div>
    <p class="muted">核对姓名和身份证号是否为同一人。证件号仅本人可见，展示时脱敏。</p>
    <div class="cell-group">
      <div class="cell"><span>姓名</span><i>{{ store.profile?.nickname || "未填" }}</i></div>
      <div class="cell"><span>真实姓名</span><i>{{ store.profile?.realName || "待核验" }}</i></div>
      <div class="cell"><span>性别</span><i>{{ genderText(store.profile?.gender) || "待补充" }}</i></div>
      <div class="cell"><span>手机</span><i>{{ maskPhone(store.profile?.phone) }}</i></div>
      <div class="cell"><span>证件类型</span><i>身份证</i></div>
      <div class="cell"><span>证件号码</span><i>{{ store.profile?.idCardMasked || "待补充" }}</i></div>
      <div class="cell"><span>核验状态</span><i>{{ store.profile?.realNamed ? "已实名" : "待核验" }}</i></div>
    </div>

    <div class="card" style="margin-top:16px" v-if="!store.profile?.realNamed">
      <div class="pad">
        <label>真实姓名</label>
        <input class="input" v-model="realName" maxlength="20" placeholder="与身份证一致" />
        <p v-if="nameError" style="color:var(--clay)">{{ nameError }}</p>
        <label>身份证号</label>
        <input class="input" v-model="idCard" maxlength="18" placeholder="18 位，末位数字或 X" />
        <p v-if="idError" style="color:var(--clay)">{{ idError }}</p>
        <button class="btn block" type="button" :disabled="saving" @click="submit">{{ saving ? "正在核验…" : "提交核验" }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { setChrome } from "@/utils/pageChrome";
import { genderText, maskPhone } from "@/utils/labels";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const realName = ref("");
const idCard = ref("");
const nameError = ref("");
const idError = ref("");
const saving = ref(false);

onMounted(async () => {
  setChrome("实名信息", "报名和提现用");
  if (!requireLogin(store, router, route)) return;
  await store.fetchMe().catch(() => {});
});

async function submit() {
  const name = realName.value.trim();
  const card = idCard.value.trim().toUpperCase();
  nameError.value = name ? "" : "请填写真实姓名";
  idError.value = /^\d{17}[\dX]$/.test(card) ? "" : "请填写 18 位身份证号";
  if (nameError.value || idError.value || saving.value) return;
  saving.value = true;
  try {
    const res = await http.post("/me/realname", { realName: name, idCard: card });
    store.profile = res.data;
    realName.value = "";
    idCard.value = "";
  } catch (e) {
    idError.value = e.message || "核验失败";
  } finally {
    saving.value = false;
  }
}
</script>
