<template>
  <div>
    <p class="muted">只保存开户行和卡号后四位，不保存完整卡号。</p>
    <div class="cell-group" v-if="cards.length">
      <div class="cell" v-for="c in cards" :key="c.id">
        <span>{{ c.bankName }} {{ c.masked }}<small class="muted" style="display:block">{{ c.holderName }}</small></span>
        <button class="btn ghost" type="button" style="padding:6px 12px" @click="remove(c)">解绑</button>
      </div>
    </div>
    <p v-else class="muted">还没有银行卡。提现前至少绑定一张。</p>

    <div class="card" style="margin-top:16px">
      <div class="pad">
        <label>持卡人</label>
        <input class="input" v-model="form.holderName" placeholder="与身份证姓名一致" />
        <label>开户银行</label>
        <select class="select" v-model="form.bankName">
          <option v-for="b in banks" :key="b" :value="b">{{ b }}</option>
        </select>
        <label>银行卡号</label>
        <input class="input" v-model="form.cardNo" inputmode="numeric" maxlength="19" placeholder="13～19 位，仅用于识别后四位" />
        <button class="btn block" type="button" :disabled="busy" @click="add">绑定银行卡</button>
      </div>
    </div>
    <p v-if="msg" :style="ok ? '' : 'color:var(--clay)'">{{ msg }}</p>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { setChrome } from "@/utils/pageChrome";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const cards = ref([]);
const banks = ref(["招商银行", "工商银行", "建设银行", "农业银行", "中国银行", "其他"]);
const form = reactive({ holderName: "", bankName: "招商银行", cardNo: "" });
const busy = ref(false);
const msg = ref("");
const ok = ref(false);

onMounted(async () => {
  setChrome("银行卡", "提现到账用");
  if (!requireLogin(store, router, route)) return;
  await load();
});

async function load() {
  const data = (await http.get("/me/wallet")).data || {};
  cards.value = data.cards || [];
  if (data.banks?.length) banks.value = data.banks;
}

async function add() {
  msg.value = "";
  ok.value = false;
  busy.value = true;
  try {
    await http.post("/me/wallet/cards", { ...form });
    form.cardNo = "";
    ok.value = true;
    msg.value = "已绑定";
    await load();
  } catch (e) {
    msg.value = e.message || "绑定失败";
  } finally {
    busy.value = false;
  }
}

async function remove(card) {
  if (!window.confirm("解绑 " + card.bankName + " 尾号 " + card.last4 + "？")) return;
  try {
    await http.delete("/me/wallet/cards/" + card.id);
    await load();
  } catch (e) {
    msg.value = e.message || "解绑失败";
  }
}
</script>
