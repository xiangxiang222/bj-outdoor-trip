<template>
  <div class="fb-page">
    <div class="fb-tabs">
      <button type="button" class="fb-tab" :class="{ on: channel === 'experience' }" @click="setChannel('experience')">体验问题</button>
      <button type="button" class="fb-tab" :class="{ on: channel === 'complaint' }" @click="setChannel('complaint')">活动、领队投诉</button>
    </div>
    <div class="fb-card">
      <p class="fb-hint">请选择您要反馈的问题类型</p>
      <div class="fb-kinds">
        <button
          v-for="item in shown"
          :key="item.key"
          type="button"
          class="fb-kind"
          :class="{ on: kind === item.key }"
          @click="kind = item.key"
        >{{ item.label }}</button>
      </div>
      <textarea v-model="content" class="fb-text" maxlength="200" rows="6" placeholder="请描述一下您的问题" />
      <div class="fb-tools">
        <div class="fb-photos">
          <div v-for="(url, i) in images" :key="url" class="fb-photo">
            <img :src="url" alt="" />
            <button type="button" class="fb-x" @click="images.splice(i, 1)">×</button>
          </div>
          <label v-if="images.length < 3" class="fb-add">
            +
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden @change="addImage" />
          </label>
        </div>
        <span class="fb-count">{{ remain }}</span>
      </div>
      <p v-if="msg" class="fb-msg" :class="{ ok }">{{ msg }}</p>
      <div class="fb-submit-row">
        <button class="fb-submit" type="button" :class="{ on: canSubmit }" :disabled="!canSubmit" @click="submit">{{ loading ? "提交中…" : "提交" }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";

const EXPERIENCE = [
  { key: "suggest", channel: "experience", label: "功能建议" },
  { key: "enroll", channel: "experience", label: "报名遇到问题" },
  { key: "perf", channel: "experience", label: "性能问题" },
  { key: "other", channel: "experience", label: "其他" },
];
const COMPLAINT = [
  { key: "trip", channel: "complaint", label: "活动体验" },
  { key: "guide", channel: "complaint", label: "领队服务" },
  { key: "refund", channel: "complaint", label: "费用与退款" },
  { key: "safety", channel: "complaint", label: "安全问题" },
];
const MAX = 200;

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const channel = ref("experience");
const kind = ref("");
const content = ref("");
const images = ref([]);
const msg = ref("");
const ok = ref(false);
const loading = ref(false);

const shown = computed(() => (channel.value === "complaint" ? COMPLAINT : EXPERIENCE));
const remain = computed(() => Math.max(0, MAX - content.value.length));
const canSubmit = computed(() => !!kind.value && content.value.trim().length >= 4 && !loading.value);

function setChannel(next) {
  channel.value = next;
  if (!shown.value.some((item) => item.key === kind.value)) kind.value = "";
}

async function addImage(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file || images.value.length >= 3) return;
  if (!requireLogin(store, router, route)) return;
  const body = new FormData();
  body.append("file", file);
  try {
    const res = await http.post("/upload", body);
    if (res.data?.url) images.value = [...images.value, res.data.url].slice(0, 3);
  } catch (err) {
    ok.value = false;
    msg.value = err.message || "上传失败";
  }
}

async function submit() {
  msg.value = "";
  if (!canSubmit.value) return;
  if (!requireLogin(store, router, route)) return;
  loading.value = true;
  try {
    const res = await http.post("/feedback", { kind: kind.value, content: content.value, images: images.value });
    ok.value = true;
    msg.value = res.message || "已收到";
    content.value = "";
    images.value = [];
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style>
.fb-page { margin: -12px -14px 0; }
.fb-tabs { display: flex; background: #fff; }
.fb-tab {
  position: relative;
  flex: 1;
  border: 0;
  background: transparent;
  padding: 14px 8px 12px;
  font-size: 15px;
  color: #333;
  cursor: pointer;
}
.fb-tab.on { color: #e1251b; font-weight: 600; }
.fb-tab.on::after {
  content: "";
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: 0;
  height: 3px;
  border-radius: 3px;
  background: #e1251b;
}
.fb-card {
  margin: 12px;
  padding: 14px 12px 12px;
  background: #fff;
  border-radius: 8px;
}
.fb-hint { margin: 0 0 10px; color: #9a9a9a; font-size: 13px; }
.fb-kinds { display: flex; flex-wrap: wrap; gap: 10px; }
.fb-kind {
  width: calc(50% - 5px);
  border: 1px solid #e6e6e6;
  background: #fff;
  border-radius: 4px;
  padding: 10px 6px;
  color: #333;
  font-size: 14px;
  cursor: pointer;
}
.fb-kind.on { color: #e1251b; border-color: #e1251b; }
.fb-text {
  width: 100%;
  margin-top: 12px;
  border: 0;
  resize: none;
  padding: 4px 0;
  min-height: 140px;
  font-size: 14px;
  line-height: 1.5;
  color: #222;
  background: transparent;
  outline: none;
}
.fb-text::placeholder { color: #c4c4c4; }
.fb-tools { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
.fb-photos { display: flex; flex-wrap: wrap; gap: 8px; }
.fb-photo, .fb-add {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 4px;
}
.fb-photo img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; display: block; }
.fb-add {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d9d9d9;
  color: #c8c8c8;
  font-size: 32px;
  font-weight: 300;
  line-height: 1;
  cursor: pointer;
}
.fb-x {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  padding: 0;
  cursor: pointer;
}
.fb-count { color: #c0c0c0; font-size: 12px; padding-bottom: 4px; }
.fb-msg { margin: 10px 0 0; font-size: 13px; color: var(--clay); }
.fb-msg.ok { color: var(--leaf); }
.fb-submit-row { display: flex; justify-content: flex-end; margin-top: 14px; }
.fb-submit {
  min-width: 76px;
  height: 34px;
  border: 0;
  border-radius: 4px;
  background: #d5d5d5;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
.fb-submit.on { background: #e1251b; }
.fb-submit:disabled { color: #fff; background: #d5d5d5; cursor: default; }
html[data-night="dark"] .fb-tabs,
html[data-night="dark"] .fb-card,
html[data-night="dark"] .fb-kind,
html[data-night="dark"] .fb-tab { background: #1c1c1e; color: #f2f2f2; }
html[data-night="dark"] .fb-kind { border-color: #3a3a3c; }
html[data-night="dark"] .fb-tab.on,
html[data-night="dark"] .fb-kind.on { color: #e1251b; background: #1c1c1e; }
html[data-night="dark"] .fb-text { color: #f2f2f2; }
html[data-night="dark"] .fb-hint { color: #9a9a9a; }
</style>
