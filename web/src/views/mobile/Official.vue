<template>
  <div class="svc-page">
    <div class="svc-hero">
      <img class="brand-mark md" src="/brand/logo.jpg" alt="同行者众" />
      <strong>需要人时，先加官方微信</strong>
      <p class="muted">账号、规则和常见问题都收在这页。线路详情不再重复写一遍。</p>
    </div>

    <div class="svc-actions">
      <button class="btn block" type="button" @click="copy(contacts.officialWechat, 'wechat')">
        {{ copied === "wechat" ? "已复制微信号" : "复制官方微信" }}
      </button>
      <button class="btn ghost block" type="button" @click="copy(contacts.officialGroup, 'group')">
        {{ copied === "group" ? "已复制群名" : "复制用户群名" }}
      </button>
    </div>
    <p class="muted svc-hint">{{ contacts.hint }}</p>

    <div class="svc-grid">
      <router-link class="svc-tile" to="/m/feedback">意见反馈</router-link>
      <router-link class="svc-tile" to="/m/lottery">报名前抽奖</router-link>
      <router-link class="svc-tile" to="/m/student">学生认证</router-link>
      <a class="svc-tile" href="#rules" @click.prevent="jumpRules">平台规则</a>
    </div>

    <div class="h2">关注我们</div>
    <div class="follow-grid">
      <button class="follow-card" type="button" v-for="a in accounts" :key="a.platform" @click="copy(a.id, a.platform)">
        <strong>{{ a.platform }}</strong>
        <em>{{ a.name }}</em>
        <span class="muted">{{ copied === a.platform ? "已复制" : a.id }}</span>
        <small class="muted">{{ a.remark }}</small>
      </button>
    </div>

    <div class="h2">常见问题</div>
    <div class="card acc-card">
      <button
        class="acc-head"
        type="button"
        v-for="(f, i) in faqs"
        :key="f.q"
        :class="{ on: openFaq === i }"
        @click="openFaq = openFaq === i ? -1 : i"
      >
        <span>
          <strong>{{ f.q }}</strong>
          <p v-show="openFaq === i" class="muted">{{ f.a }}</p>
        </span>
        <i>{{ openFaq === i ? "–" : "+" }}</i>
      </button>
    </div>

    <div id="rules" class="h2">{{ rules.title || "平台规则" }}</div>
    <p class="muted" style="margin-top:0">{{ rules.summary }}</p>
    <div class="card acc-card">
      <button
        class="acc-head"
        type="button"
        v-for="(sec, i) in rules.sections || []"
        :key="sec.title"
        :class="{ on: openRule === i }"
        @click="openRule = openRule === i ? -1 : i"
      >
        <span>
          <strong>{{ sec.title }}</strong>
          <p v-show="openRule === i" class="muted" v-for="(it, n) in sec.items" :key="n">{{ n + 1 }}. {{ it }}</p>
        </span>
        <i>{{ openRule === i ? "–" : "+" }}</i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import http from "@/api/http";

const route = useRoute();
const accounts = ref([]);
const contacts = ref({});
const rules = ref({ title: "", summary: "", sections: [] });
const faqs = ref([]);
const copied = ref("");
const openFaq = ref(0);
const openRule = ref(-1);

onMounted(async () => {
  const meta = (await http.get("/meta")).data || {};
  accounts.value = meta.officialAccounts || [];
  contacts.value = meta.contacts || {};
  rules.value = meta.commonRules || rules.value;
  faqs.value = meta.faqs || [];
  applyHash();
});

watch(() => route.hash, applyHash);

function applyHash() {
  if (route.hash === "#rules") {
    openRule.value = 0;
    setTimeout(() => document.getElementById("rules")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }
}

function jumpRules() {
  openRule.value = 0;
  document.getElementById("rules")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function copy(text, key) {
  const value = String(text || "");
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    window.prompt("复制下面的内容", value);
  }
  copied.value = key;
  setTimeout(() => {
    if (copied.value === key) copied.value = "";
  }, 1600);
}
</script>
