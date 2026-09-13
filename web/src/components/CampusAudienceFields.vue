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
      <input class="input" v-model="form.campusSchool" placeholder="学校全称" />
    </template>
    <template v-if="form.campusScope === 'college'">
      <label>学院</label>
      <input class="input" v-model="form.campusCollege" placeholder="例如：信息科学技术学院" />
    </template>
    <template v-if="form.campusScope === 'colleges'">
      <label>开放学院</label>
      <input class="input" v-model="form.colleges" placeholder="逗号分隔，例如：信息科学技术学院,计算机学院" />
    </template>
    <template v-if="form.campusScope === 'schools'">
      <label>开放学校</label>
      <input class="input" v-model="form.schools" placeholder="逗号分隔，例如：北京大学,清华大学" />
      <label>限定学院（可空）</label>
      <input class="input" v-model="form.colleges" placeholder="填写则各校同名学院可报" />
    </template>
    <p class="muted">{{ hint }}</p>
  </div>
</template>

<script setup>
import { computed, watch } from "vue";

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
