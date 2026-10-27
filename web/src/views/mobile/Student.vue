<template>
  <main class="student-page">
    <header class="student-heading">
      <span class="student-eyebrow">CAMPUS PASS</span>
      <h1>校园身份认证</h1>
      <p>让每一份校园专属出行，都找到真正的同行者。</p>
    </header>

    <section v-if="certified" class="student-status is-approved">
      <span class="status-mark" aria-hidden="true">✓</span>
      <div><strong>{{ store.profile?.isAlumni ? '校友身份已认证' : '校园身份已认证' }}</strong><p>{{ placeLine || '身份信息已通过审核' }}</p></div>
    </section>
    <section v-else-if="pending" class="student-status is-pending">
      <span class="status-mark" aria-hidden="true">…</span>
      <div><strong>资料已提交，等待审核</strong><p>{{ placeLine || '认证结果会显示在本页' }}</p></div>
    </section>
    <section v-else-if="store.profile?.studentStatus === 'rejected'" class="student-status is-rejected">
      <span class="status-mark" aria-hidden="true">!</span>
      <div><strong>暂未通过，请更新资料</strong><p>{{ store.profile?.studentReviewNote || '核对身份信息和证件照片后再次提交。' }}</p></div>
    </section>

    <form v-if="!certified && !pending" class="student-form" @submit.prevent="submit" novalidate>
      <section class="student-section">
        <div class="student-section-heading"><span>01</span><div><h2>选择身份</h2><p>在读师生或毕业校友</p></div></div>
        <div class="student-identity-options" role="group" aria-label="认证身份">
          <button type="button" :class="{ selected: campusKind === 'student' }" @click="campusKind = 'student'"><strong>在读师生</strong><small>学生 · 教职工</small><span v-if="campusKind === 'student'">✓</span></button>
          <button type="button" :class="{ selected: campusKind === 'alumni' }" @click="campusKind = 'alumni'"><strong>毕业校友</strong><small>已毕业成员</small><span v-if="campusKind === 'alumni'">✓</span></button>
        </div>
      </section>

      <section class="student-section">
        <div class="student-section-heading"><span>02</span><div><h2>填写校园信息</h2><p>用于匹配校园线路与报名范围</p></div></div>
        <label>学校 <small>选填 · 选填后可匹配校园范围</small></label>
        <CampusNamePicker v-model="school" kind="school" title="选择学校" placeholder="搜索并选择学校" />
        <label>学院 <small>选填</small></label>
        <CampusNamePicker v-model="college" kind="college" :school="school" title="选择学院" :placeholder="school ? '选择所在学院' : '请先选择学校'" :disabled="!school" />
        <label>专业 <small>选填</small></label>
        <CampusNamePicker v-model="major" kind="major" :school="school" :college="college" title="选择专业" :placeholder="college ? '选择所在专业' : '请先选择学院'" :disabled="!college" />
        <template v-if="campusKind === 'student'"><label for="student-number">学号</label><input id="student-number" class="input" v-model="studentNo" placeholder="填写学生证上的学号" maxlength="32" autocomplete="off" /></template>
      </section>

      <section class="student-section">
        <div class="student-section-heading"><span>03</span><div><h2>上传身份凭证</h2><p>仅用于核验校园身份</p></div></div>
        <label for="student-card">{{ campusKind === 'alumni' ? '毕业证或校友证' : '学生证或教职工证' }}</label>
        <input id="student-card" class="input student-upload" type="file" accept="image/jpeg,image/png,image/webp" :disabled="uploading" @change="onCard" />
        <img v-if="studentCardUrl" class="student-preview" :src="studentCardUrl" alt="证件照片预览" />
        <p v-if="uploading" class="student-upload-state">正在安全上传…</p>
        <p class="student-privacy">证件照片仅供身份审核，个人资料与校园信息用于资格匹配。</p>
      </section>

      <div v-if="msg" class="student-error" role="alert">{{ msg }}</div>
      <button class="btn student-submit" type="submit" :disabled="loading || uploading">{{ loading ? '正在提交…' : uploading ? '证件上传中…' : '提交校园认证' }}</button>
    </form>
    <div v-else class="student-help">{{ store.profile?.isAlumni ? '校友身份可报名开放给校友的活动，学生专享价格仅适用于在读师生。' : '认证后可报名仅限校园身份的活动，并享有符合条件的学生价格。' }}</div>
  </main>
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
const loading = ref(false);
const uploading = ref(false);
const certified = computed(() => !!(store.profile?.isStudent || store.profile?.isAlumni));
const pending = computed(() => !certified.value && store.profile?.studentStatus === "pending");
const placeLine = computed(() => [store.profile?.school, store.profile?.college, store.profile?.major].filter(Boolean).join(" · "));

watch(school, (next, prev) => { if (next !== prev) { college.value = ""; major.value = ""; } });
watch(college, (next, prev) => { if (next !== prev) major.value = ""; });

async function onCard(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { msg.value = "请上传 JPG、PNG 或 WebP 格式的证件照片"; return; }
  if (file.size > 5 * 1024 * 1024) { msg.value = "证件照片请小于 5MB"; return; }
  uploading.value = true;
  msg.value = "";
  const data = new FormData();
  data.append("file", file);
  try {
    const response = await http.post("/upload", data);
    studentCardUrl.value = response.data.url;
  } catch (error) {
    msg.value = error.message || "证件上传失败，请重试";
    event.target.value = "";
  } finally {
    uploading.value = false;
  }
}

async function submit() {
  if (loading.value || uploading.value || certified.value || pending.value) return;
  if (!requireLogin(store, router, route)) return;
  if (school.value && !school.value.trim()) { msg.value = "请重新选择学校"; return; }
  if (college.value && !school.value) { msg.value = "选择学院前，请先选择学校"; return; }
  if (major.value && !college.value) { msg.value = "选择专业前，请先选择学院"; return; }
  if (campusKind.value === "student" && studentNo.value.trim().length < 4) { msg.value = "请填写至少 4 位学号"; return; }
  if (!studentCardUrl.value) { msg.value = campusKind.value === "alumni" ? "请上传毕业证或校友证照片" : "请上传学生证或教职工证照片"; return; }
  loading.value = true;
  msg.value = "";
  try {
    const response = await http.post("/me/student", { school: school.value, college: college.value, major: major.value, studentNo: studentNo.value.trim(), studentCardUrl: studentCardUrl.value, campusKind: campusKind.value });
    store.setAuth(store.token, response.data);
    await nextTick();
    document.querySelector(".student-status")?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    msg.value = error.message || "提交失败，请稍后再试";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.student-page { color:#322b39; padding:8px 0 22px; }
.student-heading { padding:7px 2px 19px; }
.student-eyebrow { font-size:10px; letter-spacing:2px; color:#a392b0; }
.student-heading h1 { margin:8px 0 5px; font-size:23px; font-weight:650; line-height:1.4; }
.student-heading p { margin:0; color:#93889b; font-size:12px; line-height:1.8; }
.student-status { display:flex; align-items:flex-start; gap:13px; padding:16px; margin:0 0 17px; background:#fff; border:1px solid #eee8f2; border-radius:15px; }
.student-status .status-mark { display:grid; place-items:center; width:28px; height:28px; border-radius:50%; background:#eee7f5; color:#5b3b8c; flex:none; }
.student-status strong { display:block; font-size:13px; font-weight:600; }
.student-status p { margin:5px 0 0; font-size:11px; color:#96899f; line-height:1.7; }
.is-approved .status-mark { background:#edf4ee; color:#477451; }
.is-pending .status-mark { background:#f8f1df; color:#a7823e; }
.is-rejected .status-mark { background:#f9eaea; color:#ae5757; }
.student-form { display:flex; flex-direction:column; gap:13px; }
.student-section { background:#fff; border:1px solid #eee9f2; border-radius:16px; padding:17px 15px 14px; }
.student-section-heading { display:flex; align-items:center; gap:11px; margin-bottom:16px; }
.student-section-heading > span { color:#c4b3d4; font-family:Georgia,serif; font-size:25px; font-style:italic; }
.student-section-heading h2 { margin:0; font-size:14px; font-weight:600; }
.student-section-heading p { margin:3px 0 0; font-size:10px; color:#a297aa; }
.student-section label { display:block; margin:13px 0 2px; color:#5e5366; font-size:12px; }
.student-section label small { color:#a399ad; font-weight:400; }
.student-section :deep(.input), .student-section :deep(.select), .student-section > .input { box-sizing:border-box; border:1px solid #eae5ef; border-radius:10px; background:#faf9fc; margin:6px 0 7px; min-height:44px; padding:10px 11px; font-size:12px; }
.student-identity-options { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
.student-identity-options button { position:relative; text-align:left; min-height:66px; padding:12px; border:1px solid #eae5ef; border-radius:11px; background:#fff; color:#433849; cursor:pointer; }
.student-identity-options button.selected { border-color:#8d72a8; background:#f5f0f9; color:#5b3b8c; }
.student-identity-options strong { display:block; font-size:12px; font-weight:600; }
.student-identity-options small { display:block; margin-top:5px; font-size:10px; color:#a297aa; }
.student-identity-options button > span { position:absolute; top:10px; right:10px; color:#5b3b8c; font-size:12px; }
.student-preview { display:block; width:100%; height:155px; object-fit:contain; background:#f5f3f7; border:1px solid #eee8f2; border-radius:10px; margin:8px 0 12px; }
.student-upload-state,.student-privacy { margin:6px 0 0; color:#9b90a2; font-size:10px; line-height:1.7; }
.student-error { padding:11px 13px; background:#fff0f0; border-radius:10px; color:#b35454; font-size:12px; line-height:1.6; }
.student-submit { margin:1px 0 0; width:100%; min-height:48px; border:0; border-radius:25px; background:#5b3b8c; font-size:13px; }
.student-submit:disabled { opacity:.55; }
.student-help { background:#fff; border:1px solid #eee8f2; border-radius:14px; padding:14px; color:#968a9e; font-size:12px; line-height:1.8; }
</style>
