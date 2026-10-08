<template>
  <div>
    <p class="muted">认证时请上传学生证或校友证。学校、学院、专业可从北京高校名单里选，也可以不填。通过后可走学生价；部分团只对本院、本校或指定学校学院开放。校友不享受学生价。</p>
    <p v-if="store.profile?.isAlumni" style="color:var(--leaf)">已认证校友{{ placeText }}</p>
    <p v-else-if="store.profile?.isStudent" style="color:var(--leaf)">已认证师生{{ placeText }}</p>
    <p v-else-if="store.profile?.studentStatus === 'rejected'" class="muted">上次未通过，可修改后再次提交。</p>
    <label>身份</label>
    <select class="select" v-model="campusKind" :disabled="locked">
      <option value="student">在读师生</option>
      <option value="alumni">校友</option>
    </select>
    <label>学校（可空）</label>
    <CampusNamePicker v-model="school" kind="school" title="选择学校" placeholder="可选，搜索北京高校" :disabled="locked" />
    <label>学院（可空）</label>
    <CampusNamePicker
      v-model="college"
      kind="college"
      :school="school"
      title="选择学院"
      :placeholder="school ? '可选，搜索该校学院' : '请先选择学校'"
      :disabled="locked || !school"
    />
    <label>专业（可空）</label>
    <CampusNamePicker
      v-model="major"
      kind="major"
      :school="school"
      :college="college"
      title="选择专业"
      :placeholder="college ? '可选，搜索该院专业' : '请先选择学院'"
      :disabled="locked || !college"
    />
    <label v-if="campusKind === 'student'">学号</label>
    <input v-if="campusKind === 'student'" class="input" v-model="studentNo" placeholder="学生证上的学号" :disabled="locked" />
    <label>学生证 / 校友证</label>
    <input class="input" type="file" accept="image/jpeg,image/png,image/webp" :disabled="locked" @change="onCard" />
    <img v-if="studentCardUrl" class="cover-preview" :src="studentCardUrl" alt="学生证预览" />
    <div v-if="pending" id="cert-result" class="cert-result">
      <strong>已提交，等待审核</strong>
      <p v-if="placeLine" class="muted">{{ placeLine }}</p>
      <p class="muted">结果会显示在本页，不用重复提交。</p>
    </div>
    <p v-else-if="msg" style="color:var(--clay)">{{ msg }}</p>
    <button v-if="!pending" class="btn block" type="button" :disabled="loading || certified" @click="submit">{{ loading ? "提交中…" : "提交认证" }}</button>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import CampusNamePicker from "@/components/CampusNamePicker.vue";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const school = ref(store.profile?.school || "");
const college = ref(store.profile?.college || "");
const major = ref(store.profile?.major || "");
const studentNo = ref(store.profile?.studentNo || "");
const studentCardUrl = ref(store.profile?.studentCardUrl || "");
const campusKind = ref(store.profile?.campusKind === "alumni" ? "alumni" : "student");
const msg = ref("");
const ok = ref(false);
const loading = ref(false);
const certified = computed(() => !!(store.profile?.isStudent || store.profile?.isAlumni));
const pending = computed(() => !certified.value && store.profile?.studentStatus === "pending");
const locked = computed(() => certified.value || pending.value);
const placeBits = computed(() => [store.profile?.school, store.profile?.college, store.profile?.major].filter(Boolean));
const placeLine = computed(() => placeBits.value.join(" "));
const placeText = computed(() => (placeBits.value.length ? " · " + placeLine.value : ""));

watch(school, (next, prev) => {
  if (certified.value) return;
  if (next !== prev) {
    college.value = "";
    major.value = "";
  }
});
watch(college, (next, prev) => {
  if (certified.value) return;
  if (next !== prev) major.value = "";
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
      major: major.value,
      studentNo: studentNo.value,
      studentCardUrl: studentCardUrl.value,
      campusKind: campusKind.value,
    });
    store.setAuth(store.token, res.data);
    ok.value = true;
    msg.value = "";
    await nextTick();
    document.getElementById("cert-result")?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.cover-preview { width: 100%; height: 140px; object-fit: cover; border-radius: 12px; margin: 8px 0 16px; display: block; }
.cert-result { margin: 16px 0 24px; padding: 14px 14px 6px; background: #fff; border: 1px solid var(--play); border-radius: 12px; }
.cert-result strong { display: block; margin-bottom: 6px; }
</style>
