<template>
  <div v-if="g">
    <div class="card">
      <div class="pad guide-row">
        <div class="guide-face" style="width:64px;height:64px;font-size:22px">
          <img v-if="g.avatar" :src="g.avatar" :alt="g.name" />
          <span v-else>{{ (g.name || "导").slice(0, 1) }}</span>
        </div>
        <div>
          <div class="row">
            <strong style="font-size:18px">{{ g.name }}</strong>
            <span class="tag">{{ g.rating }} 分</span>
          </div>
          <p class="muted" style="margin:6px 0 0">
            {{ genderText(g.gender) }} · 从业 {{ g.years }} 年 · 已带团 {{ g.tripCount }} 次
          </p>
        </div>
      </div>
    </div>

    <div class="guide-meta" style="padding:0 4px">
      <span class="chip on" v-for="item in specialtyList" :key="item">{{ item }}</span>
    </div>

    <div class="h2">个人简介</div>
    <div class="card"><div class="pad">
      <p style="margin:0">{{ g.bio || "暂无简介" }}</p>
      <p class="muted" v-if="g.languages" style="margin:10px 0 0">语言：{{ g.languages }}</p>
    </div></div>

    <div class="h2">近期带团</div>
    <div class="card" v-for="s in g.upcoming" :key="s.id" @click="$router.push('/m/schedule/' + s.id)">
      <div class="pad">
        <div class="row">
          <strong>{{ s.title }}</strong>
          <span class="tag">{{ s.startDate }}</span>
        </div>
        <p class="muted" style="margin:6px 0 0">{{ s.region }}</p>
      </div>
    </div>
    <p class="muted" v-if="!g.upcoming?.length">暂时没有即将出发的行程。</p>
  </div>
  <p v-else-if="err" class="muted">{{ err }}</p>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http from "@/api/http";
import { genderText } from "@/utils/labels";

const route = useRoute();
const g = ref(null);
const err = ref("");
const specialtyList = computed(() =>
  String(g.value?.specialties || "")
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
);

onMounted(async () => {
  try {
    g.value = (await http.get("/guides/" + route.params.id)).data;
  } catch (e) {
    err.value = e.message || "导游不存在";
  }
});
</script>
