<template>
  <main class="student-page">
    <section class="student-pass" aria-labelledby="campus-pass-title">
      <div class="pass-contours" aria-hidden="true"></div>
      <div class="pass-topline"><span>CAMPUS PASS</span><span class="pass-status"><i></i>{{ certified ? '已认证' : pending ? '审核中' : rejected ? '待完善' : '待认证' }}</span></div>
      <div class="pass-hero">
        <div class="pass-copy"><span class="pass-eyebrow">校园礼遇</span><h1 id="campus-pass-title">让青春，多一种出发</h1><p>从校园到山野，遇见同频的伙伴。</p></div>
        <div class="pass-art" aria-hidden="true">
          <div class="pass-art-back"></div>
          <div class="pass-art-face"><svg viewBox="0 0 90 72" fill="none"><path d="m7 48 26-30 15 19 12-14 24 29M18 49l15-17 13 16M38 41l10-4M60 23l-1 14 10-4" /><path d="M13 59h37M13 65h24" /></svg><span class="pass-art-seal"><svg viewBox="0 0 24 24" fill="none"><path d="m6 12 4 4 8-9" /></svg></span></div>
        </div>
      </div>
      <div class="pass-bottomline"><span>同行者众 · 校园身份认证</span><span aria-hidden="true">✧</span></div>
    </section>

    <section class="student-benefits" aria-label="校园认证说明">
      <div class="student-benefit"><span class="benefit-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m3 9 9-5 9 5-9 5-9-5ZM6.5 11.2v5c3.4 2.5 7.6 2.5 11 0v-5M21 9v7" /></svg></span><div><h2>校园专属旅程</h2><p>按活动的校园报名范围参与</p></div></div>
      <div class="student-benefit"><span class="benefit-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5h16v4a2.5 2.5 0 0 0 0 5v4H4v-4a2.5 2.5 0 0 0 0-5v-4ZM14 6v3m0 2v2m0 2v3M8 9.5l2 2-2 2" /></svg></span><div><h2>指定团学生价</h2><p>仅限认证在读师生，校友不享学生价</p></div></div>
    </section>

    <div v-if="refreshing || refreshError" class="student-refresh" :class="{ 'has-error': refreshError }" role="status" aria-live="polite">
      <span>{{ refreshing ? '正在更新认证状态…' : '认证状态更新失败，当前显示上次记录' }}</span>
      <button v-if="refreshError && !refreshing" type="button" @click="refreshStatus">重试</button>
    </div>

    <section v-if="certified || pending" class="student-result" :class="{ 'is-approved': certified }" aria-live="polite">
      <div class="student-status" tabindex="-1">
        <span class="status-mark" aria-hidden="true"><svg v-if="certified" viewBox="0 0 24 24" fill="none"><path d="m6 12 4 4 8-9" /></svg><svg v-else viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg></span>
        <div><h2>{{ certified ? (store.profile?.isAlumni ? '校友身份已认证' : '校园身份已认证') : '资料已提交，等待审核' }}</h2><p>{{ certified ? '带上校园身份，去开启下一程。' : '认证结果会显示在本页，无需重复提交。' }}</p></div>
      </div>
      <dl class="student-summary">
        <div><dt>认证身份</dt><dd>{{ store.profile?.isAlumni || store.profile?.campusKind === 'alumni' ? '毕业校友' : '在读师生' }}</dd></div>
        <div><dt>学校</dt><dd>{{ store.profile?.school || '未填写' }}</dd></div>
        <div v-if="store.profile?.college"><dt>学院</dt><dd>{{ store.profile.college }}</dd></div>
        <div v-if="store.profile?.major"><dt>专业</dt><dd>{{ store.profile.major }}</dd></div>
      </dl>
      <p v-if="store.profile?.isAlumni || store.profile?.campusKind === 'alumni'" class="student-result-note">校友身份可报名开放给校友的活动，学生专享价格仅适用于在读师生。</p>
      <div class="student-result-actions"><router-link class="student-primary" to="/m?host=campus">发现校园旅程 <span aria-hidden="true">↗</span></router-link><router-link class="student-back" :to="returnPath">{{ returnPath === '/m/mine' ? '返回我的' : '返回报名' }}</router-link></div>
    </section>

    <form v-else class="student-form" @submit.prevent="submit" novalidate>
      <section v-if="rejected" class="student-rejected" role="status"><span class="rejected-mark" aria-hidden="true">!</span><div><h2>暂未通过，请更新资料</h2><p>{{ store.profile?.studentReviewNote || '核对身份信息和证件照片后再次提交。' }}</p></div></section>
      <fieldset :disabled="loading || uploading" class="student-fields">
        <section class="student-section">
          <div class="student-section-heading"><div><h2>选择认证身份</h2><p>在读师生或毕业校友</p></div><span class="section-detail">身份必选</span></div>
          <div class="student-identity-options" role="group" aria-label="认证身份">
            <button type="button" :class="{ selected: campusKind === 'student' }" :aria-pressed="campusKind === 'student'" :disabled="uploading" @click="campusKind = 'student'"><span class="identity-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m3 8 9-4 9 4-9 4-9-4ZM6 10v6c4 2.5 8 2.5 12 0v-6M21 8v7" /></svg></span><strong>在读师生</strong><small>学生 · 教职工</small><span class="identity-check" aria-hidden="true"><svg v-if="campusKind === 'student'" viewBox="0 0 20 20" fill="none"><path d="m5 10 3 3 7-7" /></svg></span></button>
            <button type="button" :class="{ selected: campusKind === 'alumni' }" :aria-pressed="campusKind === 'alumni'" :disabled="uploading" @click="campusKind = 'alumni'"><span class="identity-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="17" rx="2" /><path d="M9 7h6M9 11h6m-7 9 4-3 4 3" /></svg></span><strong>毕业校友</strong><small>已毕业成员</small><span class="identity-check" aria-hidden="true"><svg v-if="campusKind === 'alumni'" viewBox="0 0 20 20" fill="none"><path d="m5 10 3 3 7-7" /></svg></span></button>
          </div>
        </section>

        <section class="student-section">
          <div class="student-section-heading"><div><h2>校园信息</h2><p>用于匹配校园线路与报名范围</p></div><span class="section-detail">均为选填</span></div>
          <div class="campus-fields">
            <div class="student-field"><span class="student-label" id="school-label">学校 <small>选填</small></span><CampusNamePicker v-model="school" kind="school" title="选择学校" placeholder="搜索并选择学校" aria-labelledby="school-label" /></div>
            <div class="student-field"><span class="student-label" id="college-label">学院 <small>选填</small></span><CampusNamePicker v-model="college" kind="college" :school="school" title="选择学院" :placeholder="school ? '选择所在学院' : '请先选择学校'" :disabled="!school" aria-labelledby="college-label" /></div>
            <div class="student-field"><span class="student-label" id="major-label">专业 <small>选填</small></span><CampusNamePicker v-model="major" kind="major" :school="school" :college="college" title="选择专业" :placeholder="college ? '选择所在专业' : '请先选择学院'" :disabled="!college" aria-labelledby="major-label" /></div>
          </div>
          <p class="student-field-help">可留空；选学院需先选学校，选专业需先选学院。</p>
          <div v-if="campusKind === 'student'" class="student-number-field"><label for="student-number" class="student-label">学号 / 教工号 <small>必填</small></label><input id="student-number" class="input" v-model="studentNo" placeholder="填写至少 4 位学号或教工号" maxlength="32" autocomplete="off" aria-describedby="student-number-hint" /><p class="student-field-help" id="student-number-hint">请与提交的证件信息保持一致。</p></div>
        </section>

        <section class="student-section">
          <div class="student-section-heading"><div><h2>身份凭证</h2><p>{{ campusKind === 'alumni' ? '毕业证或校友证' : '学生证或教职工证' }}</p></div><span class="section-detail">必填</span></div>
          <div class="student-upload" :class="{ 'has-photo': studentCardUrl, 'is-uploading': uploading }" :aria-busy="uploading">
            <input id="student-card" class="student-upload-input" type="file" accept="image/jpeg,image/png,image/webp" :disabled="uploading" aria-label="选择或更换证件照片" aria-describedby="student-upload-help" @change="onCard" />
            <div v-if="studentCardUrl" class="student-photo"><img :src="studentCardUrl" alt="证件照片预览" /></div>
            <div class="student-upload-content"><span class="upload-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="4" y="7" width="24" height="19" rx="3" /><path d="M11 7V4h10v3M11 20l4-5 3 3 3-4 4 6" /><circle cx="11" cy="13" r="2" /></svg></span><strong>{{ uploading ? '证件上传中…' : studentCardUrl ? '证件已上传' : '上传证件照片' }}</strong><span>{{ uploading ? '请稍候，上传完成后即可提交' : studentCardUrl ? '点击更换照片' : '点击选择一张清晰的证件照片' }}</span></div>
          </div>
          <p class="student-field-help" id="student-upload-help">JPG、PNG 或 WebP，大小不超过 5MB</p>
          <div class="student-privacy"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 7 3v6c0 4-3.5 7-7 9-3.5-2-7-5-7-9V6l7-3ZM9 12l2 2 4-4" /></svg><p>证件照片用于校园身份审核，校园信息用于报名资格匹配。上传前可遮挡与认证无关的敏感信息。</p></div>
        </section>
      </fieldset>
      <div v-if="msg" class="student-error" role="alert">{{ msg }}</div>
      <button class="student-primary student-submit" type="submit" :disabled="loading || uploading">{{ loading ? '正在提交…' : uploading ? '证件上传中…' : rejected ? '更新资料并提交' : '提交校园认证' }}<span v-if="!loading && !uploading" aria-hidden="true">→</span></button>
      <p class="student-submit-note">资料提交后由平台审核，认证结果将在本页显示。</p>
      <router-link class="student-back form-back" :to="returnPath">{{ returnPath === '/m/mine' ? '返回我的' : '返回报名' }}</router-link>
    </form>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { setChrome } from "@/utils/pageChrome";
import CampusNamePicker from "@/components/CampusNamePicker.vue";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const school = ref(store.profile?.school || "");
const college = ref(store.profile?.college || "");
const major = ref(store.profile?.major || "");
const studentNo = ref(store.profile?.studentNo || "");
const studentCardUrl = ref(store.profile?.studentCardUrl || "");
const campusKind = ref(store.profile?.campusKind === "alumni" || store.profile?.isAlumni ? "alumni" : "student");
const msg = ref("");
const loading = ref(false);
const uploading = ref(false);
const refreshing = ref(false);
const refreshError = ref(false);
const certified = computed(() => !!(store.profile?.isStudent || store.profile?.isAlumni));
const pending = computed(() => !certified.value && store.profile?.studentStatus === "pending");
const rejected = computed(() => !certified.value && store.profile?.studentStatus === "rejected");
const returnPath = computed(() => {
  const target = typeof route.query.redirect === "string" ? route.query.redirect : "";
  if (!/^\/m(?:\/|\?|$)/.test(target) || /[\\\u0000-\u001f]/.test(target)) return "/m/mine";
  try {
    const url = new URL(target, window.location.origin);
    return url.origin === window.location.origin && /^\/m(?:\/|$)/.test(url.pathname) ? url.pathname + url.search + url.hash : "/m/mine";
  } catch {
    return "/m/mine";
  }
});
let disposed = false;
let profileRevision = 0;
let refreshSequence = 0;
let hydratingDraft = false;
let draftEdited = false;

watch(school, (next, prev) => { if (!hydratingDraft && next !== prev) { college.value = ""; major.value = ""; } }, { flush: "sync" });
watch(college, (next, prev) => { if (!hydratingDraft && next !== prev) major.value = ""; }, { flush: "sync" });
watch([school, college, major, studentNo, studentCardUrl, campusKind], () => { if (!hydratingDraft) draftEdited = true; }, { flush: "sync" });
onMounted(() => {
  setChrome("校园认证", "认证校园身份，发现专属旅程");
  refreshStatus();
});
onBeforeUnmount(() => { disposed = true; });

async function refreshStatus() {
  if (!store.token || refreshing.value) return;
  const token = store.token;
  const revision = profileRevision;
  const sequence = ++refreshSequence;
  refreshing.value = true;
  refreshError.value = false;
  try {
    const response = await http.get("/me");
    if (disposed || store.token !== token || revision !== profileRevision || sequence !== refreshSequence) return;
    store.setAuth(token, response.data);
    if (!draftEdited) {
      const profile = response.data;
      hydratingDraft = true;
      school.value = profile.school || "";
      college.value = profile.college || "";
      major.value = profile.major || "";
      studentNo.value = profile.studentNo || "";
      studentCardUrl.value = profile.studentCardUrl || "";
      campusKind.value = profile.campusKind === "alumni" || profile.isAlumni ? "alumni" : "student";
      hydratingDraft = false;
    }
  } catch {
    if (!disposed && store.token === token && revision === profileRevision && sequence === refreshSequence) refreshError.value = true;
  } finally {
    if (!disposed && sequence === refreshSequence) refreshing.value = false;
  }
}

async function onCard(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file || uploading.value || loading.value) return;
  input.value = "";
  if (!requireLogin(store, router, route)) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { msg.value = "请上传 JPG、PNG 或 WebP 格式的证件照片"; return; }
  if (file.size > 5 * 1024 * 1024) { msg.value = "证件照片请小于 5MB"; return; }
  const token = store.token;
  uploading.value = true;
  msg.value = "";
  const data = new FormData();
  data.append("file", file);
  try {
    const response = await http.post("/upload", data);
    if (!disposed && store.token === token) studentCardUrl.value = response.data.url;
  } catch (error) {
    if (!disposed && store.token === token) msg.value = error.message || "证件上传失败，请重试";
  } finally {
    if (!disposed) uploading.value = false;
  }
}

async function submit() {
  if (loading.value || uploading.value || certified.value || pending.value) return;
  if (!requireLogin(store, router, route)) return;
  if (school.value && !school.value.trim()) { msg.value = "请重新选择学校"; return; }
  if (college.value && !school.value) { msg.value = "选择学院前，请先选择学校"; return; }
  if (major.value && !college.value) { msg.value = "选择专业前，请先选择学院"; return; }
  if (campusKind.value === "student" && studentNo.value.trim().length < 4) { msg.value = "请填写至少 4 位学号或教工号"; return; }
  if (!studentCardUrl.value) { msg.value = campusKind.value === "alumni" ? "请上传毕业证或校友证照片" : "请上传学生证或教职工证照片"; return; }
  const token = store.token;
  profileRevision++;
  loading.value = true;
  msg.value = "";
  try {
    const response = await http.post("/me/student", { school: school.value, college: college.value, major: major.value, studentNo: campusKind.value === "student" ? studentNo.value.trim() : "", studentCardUrl: studentCardUrl.value, campusKind: campusKind.value });
    if (disposed || store.token !== token) return;
    store.setAuth(token, response.data);
    refreshError.value = false;
    await nextTick();
    const status = document.querySelector(".student-status");
    status?.scrollIntoView({ behavior: "smooth", block: "center" });
    status?.focus({ preventScroll: true });
  } catch (error) {
    if (!disposed && store.token === token) msg.value = error.message || "提交失败，请稍后再试";
  } finally {
    if (!disposed) loading.value = false;
  }
}
</script>

<style scoped>
.student-page { --sp-ink:#29252f; --sp-muted:#796f85; --sp-primary:#5b3b8c; --sp-paper:#fff; --sp-soft:#f7f4fb; --sp-line:#eae4f1; --sp-edge:#d9cbe8; --sp-pass:#fdfbff; --sp-pass-back:#e3d8ef; --sp-gradient:linear-gradient(115deg,#eee6f8 0%,#f7f3fc 72%,#eee7f6 100%); max-width:920px; margin:0 auto; padding:4px 0 24px; color:var(--sp-ink); font-size:calc(13px * var(--ui-scale,1)); line-height:1.6; overflow-wrap:anywhere; }
.student-page *, .student-page *::before, .student-page *::after { box-sizing:border-box; }
.student-page svg { display:block; flex:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; }
.student-page button, .student-page input, .student-page a { font:inherit; -webkit-tap-highlight-color:transparent; }
.student-page button:focus-visible, .student-page a:focus-visible, .student-page input:focus-visible { outline:2px solid var(--sp-primary); outline-offset:3px; }
.student-pass { position:relative; isolation:isolate; overflow:hidden; padding:21px 20px 0; border:1px solid var(--sp-edge); border-radius:21px; color:var(--sp-primary); background:var(--sp-gradient); }
.pass-topline { position:relative; display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:calc(9px * var(--ui-scale,1)); line-height:1.4; }
.pass-topline > span:first-child { letter-spacing:.17em !important; opacity:.8; }
.pass-status { display:inline-flex; align-items:center; justify-content:center; gap:5px; padding:4px 8px; border:1px solid var(--sp-edge); border-radius:20px; font-size:calc(10px * var(--ui-scale,1)); background:var(--sp-pass); }
.pass-status i { width:4px; height:4px; flex:none; border-radius:50%; background:currentColor; }
.pass-hero { position:relative; display:flex; align-items:center; gap:8px; min-height:147px; padding:14px 0 21px; }
.pass-copy { min-width:0; flex:1; }
.pass-eyebrow { display:block; margin-bottom:7px; font-size:calc(11px * var(--ui-scale,1)); color:var(--sp-muted); }
.pass-copy h1 { margin:0; color:var(--sp-primary); font-size:calc(24px * var(--ui-scale,1)); font-weight:600; line-height:1.4; word-break:keep-all; overflow-wrap:normal; text-wrap:balance; }
.pass-copy p { margin:9px 0 0; color:var(--sp-muted); font-size:calc(11px * var(--ui-scale,1)); line-height:1.8; }
.pass-art { position:relative; width:89px; height:109px; margin:5px 1px 0 5px; flex:0 0 89px; }
.pass-art-back { position:absolute; inset:5px 7px 1px; border:1px solid var(--sp-edge); border-radius:12px; background:var(--sp-pass-back); transform:rotate(-13deg) translate(-4px,2px); }
.pass-art-face { position:absolute; inset:0 1px 4px 4px; border:1px solid var(--sp-edge); border-radius:12px; background:var(--sp-pass); transform:rotate(9deg); box-shadow:0 9px 18px #5b3b8c0d; }
.pass-art-face > svg { width:100%; height:83px; padding:7px; stroke-width:1.1; }
.pass-art-face::after { content:''; position:absolute; inset:9px; border:1px solid var(--sp-line); border-radius:6px; }
.pass-art-seal { position:absolute; z-index:1; right:-7px; bottom:7px; display:grid; place-items:center; width:28px; height:28px; border:3px solid var(--sp-pass); border-radius:50%; color:var(--sp-pass); background:var(--sp-primary); }
.pass-art-seal svg { width:17px; height:17px; stroke-width:1.7; }
.pass-contours { position:absolute; z-index:-1; right:-62px; bottom:-67px; width:210px; height:212px; border:1px solid var(--sp-edge); border-radius:40%; transform:rotate(-25deg); opacity:.65; pointer-events:none; }
.pass-contours::before, .pass-contours::after { content:''; position:absolute; border:1px solid var(--sp-edge); border-radius:40%; }
.pass-contours::before { inset:13px; } .pass-contours::after { inset:26px; }
.pass-bottomline { position:relative; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 0 11px; border-top:1px solid var(--sp-edge); color:var(--sp-muted); font-size:calc(9px * var(--ui-scale,1)); }
.pass-bottomline > span:last-child { font-size:17px; line-height:1; }
.student-benefits { display:grid; gap:15px; margin:18px 1px 22px; padding:0 3px; }
.student-benefit { display:flex; align-items:center; gap:11px; }
.benefit-icon { display:grid; place-items:center; width:35px; height:35px; flex:0 0 35px; border:1px solid var(--sp-line); border-radius:11px; color:var(--sp-primary); background:var(--sp-paper); }
.benefit-icon svg { width:23px; height:23px; stroke-width:1.35; }
.student-benefit h2 { margin:0; font-size:calc(12px * var(--ui-scale,1)); font-weight:600; color:var(--sp-ink); }
.student-benefit p { margin:2px 0 0; font-size:calc(10px * var(--ui-scale,1)); color:var(--sp-muted); }
.student-refresh { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:0 0 13px; padding:10px 13px; color:var(--sp-muted); background:var(--sp-paper); border:1px solid var(--sp-line); border-radius:12px; font-size:calc(11px * var(--ui-scale,1)); }
.student-refresh button { border:0; background:transparent; color:var(--sp-primary); font-weight:600; flex:none; padding:4px; cursor:pointer; }
.student-form { display:flex; flex-direction:column; gap:13px; }
.student-fields { display:grid; gap:13px; min-width:0; margin:0; padding:0; border:0; }
.student-section, .student-result { min-width:0; border:1px solid var(--sp-line); border-radius:18px; background:var(--sp-paper); padding:19px 16px; }
.student-section-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:16px; }
.student-section-heading h2, .student-status h2, .student-rejected h2 { margin:0; color:var(--sp-ink); font-size:calc(15px * var(--ui-scale,1)); line-height:1.5; font-weight:600; }
.student-section-heading p { margin:4px 0 0; color:var(--sp-muted); font-size:calc(10px * var(--ui-scale,1)); }
.section-detail { color:var(--sp-muted); font-size:calc(10px * var(--ui-scale,1)); line-height:1.7; flex:none; padding-top:2px; }
.student-identity-options { display:grid; grid-template-columns:1fr 1fr; gap:11px; }
.student-identity-options button { position:relative; min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:5px; padding:14px 12px 12px; border:1px solid var(--sp-line); border-radius:12px; text-align:left; color:var(--sp-ink); background:var(--sp-paper); cursor:pointer; }
.student-identity-options button.selected { border-color:var(--sp-primary); background:var(--sp-soft); color:var(--sp-primary); }
.identity-symbol { color:var(--sp-primary); margin-bottom:1px; }
.identity-symbol svg { width:25px; height:25px; stroke-width:1.35; }
.student-identity-options strong { background:transparent; color:inherit; font-size:calc(13px * var(--ui-scale,1)); font-weight:600; line-height:1.5; }
.student-identity-options small { color:var(--sp-muted); font-size:calc(10px * var(--ui-scale,1)); line-height:1.6; }
.identity-check { position:absolute; top:14px; right:11px; width:16px; height:16px; border:1px solid var(--sp-edge); border-radius:50%; }
.selected .identity-check { background:var(--sp-primary); border-color:var(--sp-primary); color:var(--sp-paper); }
.identity-check svg { width:100%; height:100%; stroke-width:1.5; }
.campus-fields { display:grid; gap:14px; }
.student-field { min-width:0; }
.student-label { display:flex; align-items:center; gap:7px; margin:0 0 7px; color:var(--sp-ink); font-size:calc(12px * var(--ui-scale,1)); line-height:1.5; }
.student-label small { color:var(--sp-muted); font-size:calc(10px * var(--ui-scale,1)); }
.student-section :deep(.input) { width:100%; min-height:46px; margin:0; padding:12px; border:1px solid var(--sp-line); border-radius:10px; color:var(--sp-ink); background:var(--sp-soft); font-size:calc(12px * var(--ui-scale,1)); line-height:1.6; }
.student-section :deep(.campus-pick-btn) { display:flex; justify-content:space-between; align-items:center; gap:10px; }
.student-section :deep(.campus-pick-btn)::after { content:''; width:6px; height:6px; flex:none; margin-right:2px; border-top:1px solid var(--sp-muted); border-right:1px solid var(--sp-muted); transform:rotate(45deg); }
.student-section :deep(.muted), .student-section :deep(.input)::placeholder { color:var(--sp-muted); opacity:1; }
.student-section :deep(.campus-pick-btn:disabled) { opacity:.6; cursor:not-allowed; }
.student-field-help { margin:8px 0 0; color:var(--sp-muted); font-size:calc(10px * var(--ui-scale,1)); line-height:1.8; }
.student-number-field { margin-top:18px; padding-top:17px; border-top:1px solid var(--sp-line); }
.student-upload { position:relative; isolation:isolate; display:flex; align-items:center; justify-content:center; min-height:168px; padding:20px 12px; border:1px dashed var(--sp-edge); border-radius:13px; background:var(--sp-soft); text-align:center; overflow:hidden; }
.student-upload:focus-within { outline:2px solid var(--sp-primary); outline-offset:3px; }
.student-upload-input { position:absolute; z-index:2; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; }
.student-upload-input:disabled { cursor:progress; }
.student-upload-content { display:flex; align-items:center; flex-direction:column; gap:5px; min-width:0; color:var(--sp-muted); pointer-events:none; }
.upload-icon { display:grid; place-items:center; width:42px; height:42px; margin-bottom:4px; color:var(--sp-primary); }
.upload-icon svg { width:36px; height:36px; stroke-width:1.2; }
.student-upload-content strong { color:var(--sp-primary); background:transparent; font-size:calc(13px * var(--ui-scale,1)); font-weight:600; }
.student-upload-content > span:last-child { font-size:calc(10px * var(--ui-scale,1)); line-height:1.7; }
.student-upload.has-photo { gap:15px; text-align:left; padding:13px; }
.student-photo { flex:0 0 88px; height:93px; overflow:hidden; border:1px solid var(--sp-line); border-radius:8px; background:var(--sp-paper); }
.student-photo img { display:block; width:100%; height:100%; object-fit:contain; }
.has-photo .student-upload-content { align-items:flex-start; flex:1; }
.has-photo .upload-icon { width:28px; height:28px; margin-bottom:0; }.has-photo .upload-icon svg { width:26px; height:26px; }
.is-uploading .upload-icon { opacity:.6; }
.student-privacy { display:flex; align-items:flex-start; gap:8px; margin-top:14px; padding:11px 12px; border-radius:10px; background:var(--sp-soft); color:var(--sp-muted); }
.student-privacy > svg { width:17px; height:17px; margin-top:2px; color:var(--sp-primary); stroke-width:1.3; }
.student-privacy p { margin:0; font-size:calc(10px * var(--ui-scale,1)); line-height:1.9; }
.student-error { padding:12px 14px; border:1px solid #e8cad0; border-radius:11px; color:#a4475b; background:#fff4f6; font-size:calc(12px * var(--ui-scale,1)); line-height:1.8; }
.student-primary { display:flex; align-items:center; justify-content:center; gap:14px; min-height:48px; width:100%; border:1px solid var(--sp-primary); border-radius:25px; padding:12px 16px; color:var(--sp-paper); background:var(--sp-primary); font-size:calc(13px * var(--ui-scale,1)); font-weight:600; line-height:1.6; text-align:center; text-decoration:none; cursor:pointer; }
.student-submit { margin-top:4px; }.student-primary:disabled { opacity:.6; cursor:wait; }
.student-primary > span { font-size:20px; line-height:1; flex:none; }
.student-submit-note { margin:0 4px; text-align:center; color:var(--sp-muted); font-size:calc(10px * var(--ui-scale,1)); line-height:1.8; }
.student-back { display:block; padding:10px; text-align:center; text-decoration:none; color:var(--sp-muted); font-size:calc(12px * var(--ui-scale,1)); line-height:1.7; }.form-back { margin-top:-2px; }
.student-status { display:flex; gap:12px; align-items:flex-start; outline:none; }.student-status:focus-visible { outline:2px solid var(--sp-primary); outline-offset:5px; border-radius:4px; }
.status-mark { display:grid; place-items:center; width:37px; height:37px; flex:0 0 37px; border:1px solid var(--sp-edge); border-radius:50%; color:var(--sp-primary); background:var(--sp-soft); }
.status-mark svg { width:23px; height:23px; stroke-width:1.5; }
.student-status p { margin:5px 0 0; color:var(--sp-muted); font-size:calc(11px * var(--ui-scale,1)); line-height:1.8; }
.student-summary { margin:20px 0 18px; padding:15px 0; border-top:1px solid var(--sp-line); border-bottom:1px solid var(--sp-line); }
.student-summary > div { display:flex; justify-content:space-between; gap:20px; padding:6px 0; font-size:calc(12px * var(--ui-scale,1)); line-height:1.8; }.student-summary dt { color:var(--sp-muted); flex:0 0 28%; }.student-summary dd { margin:0; min-width:0; color:var(--sp-ink); text-align:right; }
.student-result-note { margin:0 0 18px; color:var(--sp-muted); font-size:calc(11px * var(--ui-scale,1)); line-height:1.8; }
.student-result-actions { display:grid; gap:7px; }
.student-rejected { display:flex; gap:11px; padding:15px; border:1px solid #e6d1d9; border-radius:14px; color:#985469; background:#fff5f7; }.rejected-mark { display:grid; place-items:center; width:23px; height:23px; flex:0 0 23px; border:1px solid currentColor; border-radius:50%; font-size:13px; }.student-rejected h2 { color:inherit; font-size:calc(13px * var(--ui-scale,1)); }.student-rejected p { margin:5px 0 0; font-size:calc(11px * var(--ui-scale,1)); line-height:1.8; }
:global(html[data-night="dark"] .student-page) { --sp-ink:#eeebf3; --sp-muted:#b7a8c7; --sp-primary:#cfb5ee; --sp-paper:#211d28; --sp-soft:#2d2538; --sp-line:#3c314a; --sp-edge:#655076; --sp-pass:#3c304b; --sp-pass-back:#4a395d; --sp-gradient:linear-gradient(115deg,#302638 0%,#292230 72%,#33283e 100%); }
:global(html[data-night="dark"] .mp-phone.is-account .student-page strong) { background:transparent; color:inherit; }
:global(html[data-night="dark"] .student-page .student-primary) { color:#251a31; background:var(--sp-primary); }
:global(html[data-night="dark"] .student-page .student-error), :global(html[data-night="dark"] .student-page .student-rejected) { color:#efb7c8; background:#34242f; border-color:#604151; }
@media (min-width:620px) {
  .student-pass { padding:25px 30px 0; }.pass-hero { min-height:182px; gap:25px; }.pass-copy h1 { font-size:calc(32px * var(--ui-scale,1)); }.pass-copy p { font-size:calc(12px * var(--ui-scale,1)); }.pass-art { flex-basis:112px; width:112px; height:136px; margin-right:15px; }.pass-art-face > svg { height:108px; padding:10px; }.pass-art-seal { width:34px; height:34px; }.pass-art-seal svg { width:20px; height:20px; }.student-benefits { grid-template-columns:1fr 1fr; gap:20px; padding:0 12px; margin:22px 0 27px; }.student-section { padding:23px 25px; }.campus-fields { grid-template-columns:repeat(3,minmax(0,1fr)); }.student-result { max-width:640px; margin:auto; padding:26px; }.student-result-actions { grid-template-columns:1fr 1fr; align-items:center; }.student-form { max-width:760px; margin:auto; gap:16px; }.student-fields { gap:16px; }.student-upload { min-height:180px; }.student-upload.has-photo { justify-content:flex-start; padding:20px; }.student-photo { flex-basis:135px; height:122px; }.student-submit { max-width:390px; margin:5px auto 0; }
}
@media (max-width:350px) {
  .student-pass { padding:17px 15px 0; }.pass-hero { min-height:146px; gap:5px; }.pass-copy h1 { font-size:calc(22px * var(--ui-scale,1)); }.pass-art { width:65px; height:91px; flex-basis:65px; margin-left:3px; }.pass-art-face > svg { height:69px; padding:4px; }.pass-art-seal { width:24px; height:24px; bottom:3px; }.pass-art-seal svg { width:14px; height:14px; }.student-section { padding:17px 13px; }.student-section-heading { gap:8px; }.student-identity-options { gap:8px; }.student-identity-options button { padding:12px 10px; }.student-upload.has-photo { gap:10px; }.student-photo { flex-basis:67px; height:86px; }
}
</style>
