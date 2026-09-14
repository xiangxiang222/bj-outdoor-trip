<template>
  <div>
    <label>校园范围</label>
    <select class="select" v-model="form.campusScope">
      <option value="open">不限制学校学院</option>
      <option value="certified">仅已认证师生（不限学校）</option>
      <option value="college">仅本学院</option>
      <option value="school">仅本校</option>
      <option value="colleges">本校跨学院</option>
      <option value="schools">跨学校</option>
    </select>
    <label class="check-row"><input type="checkbox" v-model="form.alumniOk" /> 允许已认证校友</label>
    <template v-if="form.campusScope === 'college' || form.campusScope === 'school' || form.campusScope === 'colleges'">
      <label>学校</label>
      <CampusNamePicker v-model="form.campusSchool" kind="school" title="选择学校" placeholder="可选，搜索学校" />
    </template>
    <template v-if="form.campusScope === 'college'">
      <label>学院</label>
      <CampusNamePicker v-model="form.campusCollege" kind="college" :school="form.campusSchool" title="选择学院" placeholder="可选，搜索学院" />
    </template>
    <template v-if="form.campusScope === 'colleges'">
      <label>开放学院</label>
      <CampusNamePicker v-model="form.colleges" kind="college" :school="form.campusSchool" multiple title="选择学院" placeholder="可选，搜索后多选" />
    </template>
    <template v-if="form.campusScope === 'schools'">
      <label>开放学校</label>
      <CampusNamePicker v-model="form.schools" kind="school" multiple title="选择学校" placeholder="可选，搜索后多选" />
      <label>限定学院（可空）</label>
      <CampusNamePicker v-model="form.colleges" kind="college" multiple title="选择学院" placeholder="可空，填写则各校同名学院可报" />
    </template>
    <p class="muted">{{ hint }}</p>
  </div>
</template>

<script setup>
import { computed, watch } from "vue";
import CampusNamePicker from "@/components/CampusNamePicker.vue";

const form = defineModel({ type: Object, required: true });
const props = defineProps({
  profile: { type: Object, default: () => ({}) },
});

watch(
  () => form.value.campusScope,
  (scope) => {
    const school = form.value.campusSchool || form.value.companyName || props.profile?.school || "";
    const college = form.value.campusCollege || props.profile?.college || "";
    if (!form.value.campusSchool && school) form.value.campusSchool = school;
    if (!form.value.campusCollege && college) form.value.campusCollege = college;
    if (scope === "colleges" && college && !String(form.value.colleges || "").trim()) form.value.colleges = college;
    if (scope === "schools" && school && !String(form.value.schools || "").trim()) form.value.schools = school;
  }
);

const hint = computed(() => {
  const scope = form.value.campusScope;
  if (scope === "college") return "先对本学院开放，开团后仍可再开放其他学院或学校。";
  if (scope === "school") return "本校各学院可报。开团后仍可再开放其他学校。";
  if (scope === "colleges") return "本校指定学院可报，开团后可继续加学院或学校。";
  if (scope === "schools") return "名单内学校可报。学院留空表示这些学校的各学院都能加入。";
  if (scope === "certified") return "已认证师生均可报名，不限学校学院。";
  return "不限制校园范围。高校免费团仍会默认仅本校。";
});
</script>
