<template>
  <div>
    <div class="card">
      <div class="pad" style="text-align:center">
        <img class="brand-mark lg" src="/brand/logo.jpg" alt="同行者众" />
        <strong>官方账号</strong>
        <p class="muted">各平台联系方式。规则统一放在本页，线路里不再重复写。</p>
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

    <div id="rules" class="card">
      <div class="pad">
        <strong>{{ rules.title || "统一规则" }}</strong>
        <p class="muted">{{ rules.summary }}</p>
      </div>
    </div>
    <div class="card" v-for="sec in rules.sections || []" :key="sec.title">
      <div class="pad">
        <div class="h2" style="margin-top:0">{{ sec.title }}</div>
        <p v-for="(it, i) in sec.items" :key="i" class="muted">{{ i + 1 }}. {{ it }}</p>
      </div>
    </div>
    <div class="card" v-if="faqs.length">
      <div class="pad">
        <div class="h2" style="margin-top:0">常见问题</div>
        <div class="faq-item" v-for="f in faqs" :key="f.q">
          <strong>{{ f.q }}</strong>
          <p class="muted">{{ f.a }}</p>
        </div>
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
const rules = ref({ title: "", summary: "", sections: [] });
const faqs = ref([]);
const msg = ref("");

onMounted(async () => {
  const meta = (await http.get("/meta")).data || {};
  accounts.value = meta.officialAccounts || [];
  contacts.value = meta.contacts || {};
  rules.value = meta.commonRules || rules.value;
  faqs.value = meta.faqs || [];
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
