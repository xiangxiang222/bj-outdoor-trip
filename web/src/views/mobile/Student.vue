<template>
  <div>
    <p class="muted">认证时请上传学生证或校友证，并填写学校、学院。通过后可走学生价；部分团只对本院、本校或指定学校学院开放。校友不享受学生价。</p>
    <p v-if="store.profile?.isAlumni" style="color:var(--leaf)">已认证校友{{ placeText }}</p>
    <p v-else-if="store.profile?.isStudent" style="color:var(--leaf)">已认证师生{{ placeText }}</p>
    <p v-else-if="store.profile?.studentStatus === 'pending'" class="muted">审核中{{ placeText }}</p>
    <label>身份</label>
    <select class="select" v-model="campusKind" :disabled="certified">
      <option value="student">在读师生</option>
      <option value="alumni">校友</option>
    </select>
    <label>学校</label>
    <input class="input" v-model="school" placeholder="填写学校全称" :disabled="certified" />
    <label>学院</label>
    <input class="input" v-model="college" placeholder="例如：信息科学技术学院" :disabled="certified" />
    <label v-if="campusKind === 'student'">学号</label>
    <input v-if="campusKind === 'student'" class="input" v-model="studentNo" placeholder="学生证上的学号" :disabled="certified" />
    <label>学生证 / 校友证</label>
    <input class="input" type="file" accept="image/jpeg,image/png,image/webp" :disabled="certified" @change="onCard" />
    <img v-if="studentCardUrl" class="cover-preview" :src="studentCardUrl" alt="学生证预览" />
    <p v-if="msg" :style="ok ? 'color:var(--leaf)' : 'color:var(--clay)'">{{ msg }}</p>
    <button class="btn block" type="button" :disabled="loading || certified" @click="submit">{{ loading ? "提交中…" : "提交认证" }}</button>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const school = ref(store.profile?.school || "");
const college = ref(store.profile?.college || "");
const studentNo = ref(store.profile?.studentNo || "");
const studentCardUrl = ref(store.profile?.studentCardUrl || "");
const campusKind = ref(store.profile?.campusKind === "alumni" ? "alumni" : "student");
const msg = ref("");
const ok = ref(false);
const loading = ref(false);
const certified = computed(() => !!(store.profile?.isStudent || store.profile?.isAlumni));
const placeText = computed(() => {
  const bits = [store.profile?.school, store.profile?.college].filter(Boolean);
  return bits.length ? " · " + bits.join(" ") : "";
});

async function onCard(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const data = new FormData();
  data.append("file", file);
  try {
    const res = await http.post("/upload", data);
    studentCardUrl.value = res.data.url;
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
    const res = await http.post("/me/student", {
      school: school.value,
      college: college.value,
      studentNo: studentNo.value,
      studentCardUrl: studentCardUrl.value,
      campusKind: campusKind.value,
    });
    store.setAuth(store.token, res.data);
    ok.value = true;
    msg.value = res.message || "已提交";
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
