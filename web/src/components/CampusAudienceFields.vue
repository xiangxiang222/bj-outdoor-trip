<template>
  <div class="audience-fields">
    <div class="audience-title"><strong>邀请谁一起出发</strong><span>发布后可继续扩大范围</span></div>
    <div class="audience-options" role="group" aria-label="校园报名范围">
      <button v-for="scope in scopes" :key="scope.key" type="button" :class="{ selected: form.campusScope === scope.key }" :disabled="scope.key === 'open' && form.offerType === 'free'" @click="form.campusScope = scope.key">
        <strong>{{ scope.label }}</strong><small>{{ scope.key === 'open' && form.offerType === 'free' ? '免费高校团需学生认证' : scope.hint }}</small><span v-if="form.campusScope === scope.key" class="audience-check">✓</span>
      </button>
    </div>
    <div v-if="['college', 'school', 'colleges'].includes(form.campusScope)" class="audience-location">
      <label>开放报名的学校</label>
      <CampusNamePicker v-model="form.campusSchool" kind="school" title="选择学校" placeholder="搜索并选择学校" />
      <template v-if="form.campusScope === 'college'">
        <label>开放报名的学院</label>
        <CampusNamePicker v-model="form.campusCollege" kind="college" :school="form.campusSchool" :disabled="!form.campusSchool" title="选择学院" :placeholder="form.campusSchool ? '选择该校学院' : '请先选择学校'" />
      </template>
      <template v-if="form.campusScope === 'colleges'">
        <label>开放报名的学院 · 可多选</label>
        <CampusNamePicker v-model="form.colleges" kind="college" :school="form.campusSchool" multiple :disabled="!form.campusSchool" title="选择开放学院" :placeholder="form.campusSchool ? '选择一个或多个学院' : '请先选择学校'" />
      </template>
    </div>
    <div v-if="form.campusScope === 'schools'" class="audience-location">
      <label>开放学校与学院</label>
      <p class="audience-hint">每组独立匹配，学院或专业留空即向该校或该院全部开放。</p>
      <CampusTargetList v-model="form.campusTargets" v-model:ratio="form.genderRatio" />
    </div>
    <div class="audience-toggle"><div><strong>允许已认证校友</strong><small>{{ form.campusScope === 'open' ? '开放报名已包含所有人' : '校友可报名，仍按普通价格计费' }}</small></div><el-switch v-model="form.alumniOk" :disabled="form.campusScope === 'open'" aria-label="允许已认证校友" /></div>
    <div class="audience-preview" aria-live="polite"><span>报名范围预览</span><p>{{ summary }}</p></div>
    <p v-if="form.offerType === 'free'" class="audience-hint">高校免费团仅限已认证师生；允许校友后，认证校友也可报名。报名范围以上方预览为准。</p>
  </div>
</template>

<script setup>
import { computed, watch } from "vue";
import CampusNamePicker from "@/components/CampusNamePicker.vue";
import CampusTargetList from "@/components/CampusTargetList.vue";
import { emptyCampusTarget } from "@/utils/campusTargets";
import { CAMPUS_SCOPES, campusAudienceSummary } from "@/utils/publishPlan";

const form = defineModel({ type: Object, required: true });
const props = defineProps({ profile: { type: Object, default: () => ({}) } });
const scopes = CAMPUS_SCOPES;
const summary = computed(() => campusAudienceSummary(form.value));

watch(() => form.value.campusScope, (scope) => {
  if (scope === "open") form.value.alumniOk = false;
  const school = form.value.campusSchool || form.value.companyName || props.profile?.school || "";
  const college = form.value.campusCollege || props.profile?.college || "";
  if (!form.value.campusSchool && school) form.value.campusSchool = school;
  if (!form.value.campusCollege && college) form.value.campusCollege = college;
  if (scope === "colleges" && college && !String(form.value.colleges || "").trim()) form.value.colleges = college;
  if (scope === "schools" && !form.value.campusTargets?.length) form.value.campusTargets = [emptyCampusTarget(school)];
});
watch(() => form.value.campusSchool, (next, prev) => {
  if (!prev || next === prev) return;
  form.value.campusCollege = "";
  form.value.colleges = "";
});
</script>

<style scoped>
.audience-title { display:flex; flex-wrap:wrap; justify-content:space-between; gap:6px; margin-bottom:14px; }
.audience-title strong { font-size:15px; color:#26222b; }
.audience-title > span { font-size:11px; color:#96909f; align-self:center; }
.audience-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
.audience-options button { position:relative; text-align:left; padding:13px 11px; border:1px solid #eae7ef; background:#fff; border-radius:12px; color:#37313d; cursor:pointer; min-height:66px; }
.audience-options button.selected { border-color:#76549f; background:#f6f1fb; color:#5b3b8c; }
.audience-options button:disabled { cursor:not-allowed; opacity:.56; }
.audience-options strong { display:block; font-weight:600; font-size:14px; }
.audience-options small { display:block; font-size:10px; margin-top:4px; color:#918798; }
.audience-check { position:absolute; right:9px; top:10px; font-size:12px; }
.audience-location { margin-top:20px; }
.audience-location label { display:block; font-size:13px; font-weight:600; color:#4b4252; }
.audience-hint { margin:8px 0 10px; color:#918798; font-size:12px; line-height:1.65; }
.audience-toggle { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:18px 0 12px; }
.audience-toggle strong { font-size:13px; font-weight:500; }
.audience-toggle small { display:block; font-size:11px; margin-top:3px; color:#918798; }
.audience-preview { border-radius:12px; background:#f5f1f9; padding:12px 14px; border:1px solid #ece5f4; }
.audience-preview > span { font-size:11px; color:#8e7c9e; }
.audience-preview p { margin:5px 0 0; line-height:1.7; font-size:12px; color:#5b3b8c; overflow-wrap:anywhere; }
.audience-fields :deep(.campus-target) { background:#f8f7fa; padding:10px; border-radius:12px; }
.audience-fields :deep(.campus-target-row) { grid-template-columns:1fr; gap:0; }
.audience-fields :deep(.campus-target-row > .btn) { padding:7px 12px; font-size:11px; justify-self:end; box-shadow:none; }
.audience-fields :deep(.campus-target-list > .btn) { font-size:12px; width:100%; border-style:dashed; box-shadow:none; padding:10px; }
</style>
