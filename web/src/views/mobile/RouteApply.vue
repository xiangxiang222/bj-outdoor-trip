<template>
  <div>
    <p class="muted">把想收录的线路交给平台审。通过后会出现在「线路」里，任何人都能开团报名。这和首页「发团」不是同一件事。</p>
    <div v-if="done" class="card">
      <div class="pad">
        <p style="color:var(--leaf);margin-top:0">{{ done.message }}</p>
        <p>客服微信 <strong>{{ wechat }}</strong> · {{ contacts.officialWechatName || "官方客服" }}</p>
        <button class="btn block" type="button" @click="copyWechat">{{ copied ? "已复制微信号" : "复制客服微信" }}</button>
      </div>
    </div>

    <label>线路标题</label>
    <input class="input" v-model="form.title" placeholder="例如：慕田峪长城缆车一日" />
    <label>副标题</label>
    <input class="input" v-model="form.subtitle" placeholder="一句话卖点，可空" />
    <label>地区</label>
    <input class="input" v-model="form.region" placeholder="例如：北京市 / 怀柔区" />
    <label>天数</label>
    <select class="select" v-model="form.days">
      <option :value="1">1 日</option>
      <option :value="2">2 日</option>
      <option :value="3">3 日</option>
      <option value="multi">多日</option>
    </select>
    <label>建议成团人数</label>
    <input class="input" type="number" min="1" max="80" v-model.number="form.minGroupSize" />
    <label>参考价（元 / 人）</label>
    <input class="input" type="number" min="0" v-model.number="form.originPrice" />
    <label>封面</label>
    <input class="input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" @change="onCover" />
    <img v-if="form.cover" class="cover-preview" :src="form.cover" alt="" />
    <label>介绍</label>
    <textarea class="input" rows="4" v-model="form.description" placeholder="走哪、看什么、适合谁" />
    <label>手机号</label>
    <input class="input" v-model="form.contactPhone" maxlength="11" placeholder="11 位手机，方便通过后联系你" />
    <label>微信号</label>
    <input class="input" v-model="form.contactWechat" maxlength="32" placeholder="通过后客服加你" />
    <p v-if="msg" :style="ok ? 'color:var(--leaf)' : 'color:var(--clay)'">{{ msg }}</p>
    <button class="btn block" type="button" :disabled="loading" @click="submit">{{ loading ? "提交中…" : "提交申请" }}</button>

    <div v-if="apps.length" class="h2">我的申请</div>
    <div v-for="a in apps" :key="a.id" class="card">
      <div class="pad">
        <div class="row">
          <strong>{{ a.title }}</strong>
          <span class="tag">{{ statusText(a) }}</span>
        </div>
        <p class="muted" style="margin-bottom:0">{{ a.region }} · {{ a.bountyHint }}</p>
        <p v-if="a.reviewNote" class="muted">{{ a.reviewNote }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const bounty = computed(() => Number(store.meta?.routeBounty || 300));
const contacts = ref({ officialWechat: "同行者众", officialWechatName: "同行者众官方" });
const wechat = computed(() => contacts.value.officialWechat || "同行者众");
const apps = ref([]);
const done = ref(null);
const copied = ref(false);
const msg = ref("");
const ok = ref(false);
const loading = ref(false);
const form = ref({
  title: "",
  subtitle: "",
  region: "",
  days: 1,
  minGroupSize: 10,
  originPrice: 199,
  cover: "",
  description: "",
  contactPhone: store.profile?.phone || "",
  contactWechat: "",
});

onMounted(async () => {
  if (!requireLogin(store, router, route)) return;
  if (!store.meta) await store.fetchMeta().catch(() => {});
  await loadApps();
});

async function loadApps() {
  try {
    const res = await http.get("/routes/apps");
    const data = res.data || {};
    apps.value = data.list || [];
    if (data.contacts) contacts.value = data.contacts;
  } catch (e) {
    msg.value = e.message || "加载失败";
  }
}

async function onCover(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const data = new FormData();
  data.append("file", file);
  try {
    const res = await http.post("/upload", data);
    form.value.cover = res.data.url;
    msg.value = "";
  } catch (ex) {
    ok.value = false;
    msg.value = ex.message || "上传失败";
  }
}

async function submit() {
  if (!requireLogin(store, router, route)) return;
  loading.value = true;
  msg.value = "";
  try {
    const res = await http.post("/routes/apply", form.value);
    ok.value = true;
    done.value = {
      message: res.data?.message || res.message || "已提交审核",
      contacts: res.data?.contacts || contacts.value,
    };
    if (res.data?.contacts) contacts.value = res.data.contacts;
    form.value.title = "";
    form.value.subtitle = "";
    form.value.description = "";
    form.value.cover = "";
    await loadApps();
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    loading.value = false;
  }
}

function statusText(a) {
  if (a.bountyStatus === "paid") return "已发奖";
  if (a.reviewStatus === "pending") return "审核中";
  if (a.reviewStatus === "rejected") return "未通过";
  return "已通过";
}

async function copyWechat() {
  const value = String(wechat.value || "");
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    window.prompt("复制下面的微信号", value);
  }
  copied.value = true;
}
</script>
