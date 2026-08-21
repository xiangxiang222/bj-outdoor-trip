<template>
  <div>
    <div class="card">
      <div class="pad">
        <strong>北野行官方</strong>
        <p class="muted">各平台账号与联系方式。添加官方微信后可拉入用户群。</p>
      </div>
    </div>
    <div class="card" v-for="a in accounts" :key="a.platform">
      <div class="pad contact-row">
        <span>
          <strong>{{ a.platform }}</strong>
          <em class="muted"> {{ a.name }} {{ a.id }}</em>
          <p class="muted" style="margin:4px 0 0">{{ a.remark }}</p>
        </span>
        <a class="nav-link" href="#" @click.prevent="copy(a.id)">复制</a>
      </div>
    </div>
    <div class="card" v-if="contacts.officialWechat">
      <div class="pad">
        <div class="contact-row">
          <span>官方微信 {{ contacts.officialWechatName }} <em class="muted">{{ contacts.officialWechat }}</em></span>
          <a class="nav-link" href="#" @click.prevent="copy(contacts.officialWechat)">复制</a>
        </div>
        <div class="contact-row">
          <span>官方用户群 {{ contacts.officialGroup }}</span>
        </div>
        <p class="muted">{{ contacts.hint }}</p>
      </div>
    </div>
    <p v-if="msg" class="muted">{{ msg }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import http from "@/api/http";

const accounts = ref([]);
const contacts = ref({});
const msg = ref("");

onMounted(async () => {
  const meta = (await http.get("/meta")).data || {};
  accounts.value = meta.officialAccounts || [];
  contacts.value = meta.contacts || {};
});

async function copy(text) {
  try {
    await navigator.clipboard.writeText(String(text || ""));
    msg.value = "已复制 " + text;
  } catch {
    msg.value = String(text || "");
  }
}
</script>
