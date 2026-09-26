<template>
  <div>
    <div class="card" v-for="c in list" :key="c.id">
      <div class="pad">
        <div class="row">
          <strong>{{ c.name }}</strong>
          <button class="btn ghost" type="button" @click="remove(c)">删除</button>
        </div>
        <p class="muted" style="margin:6px 0 0">{{ c.phone }}</p>
        <p v-if="c.emergencyName || c.emergencyPhone" class="muted">紧急联系人 {{ c.emergencyName }} {{ c.emergencyPhone }}</p>
      </div>
    </div>
    <p v-if="!list.length" class="muted">报名时点「存为常用」，下次可以点一下带入。</p>
    <div class="card">
      <div class="pad">
        <div class="h2" style="margin-top:0">{{ form.id ? "修改报名人" : "新增报名人" }}</div>
        <input class="input" v-model="form.name" maxlength="20" placeholder="称呼" />
        <input class="input" v-model="form.phone" maxlength="11" placeholder="手机号" />
        <input class="input" v-model="form.emergencyName" maxlength="20" placeholder="紧急联系人（选填）" />
        <input class="input" v-model="form.emergencyPhone" maxlength="11" placeholder="紧急联系人手机（选填）" />
        <button class="btn block" type="button" @click="save">保存</button>
        <p v-if="msg" class="muted">{{ msg }}</p>
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

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const list = ref([]);
const msg = ref("");
const form = ref({ id: 0, name: "", phone: "", emergencyName: "", emergencyPhone: "" });

onMounted(load);

async function load() {
  if (!requireLogin(store, router, route)) return;
  list.value = (await http.get("/me/companions")).data || [];
}

async function save() {
  msg.value = "";
  try {
    list.value = (await http.post("/me/companions", form.value)).data || [];
    form.value = { id: 0, name: "", phone: "", emergencyName: "", emergencyPhone: "" };
    msg.value = "已保存";
  } catch (e) {
    msg.value = e.message || "保存失败";
  }
}

async function remove(c) {
  list.value = (await http.delete("/me/companions/" + c.id)).data || [];
}
</script>
