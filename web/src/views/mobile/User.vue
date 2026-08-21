<template>
  <div v-if="u">
    <div class="card">
      <div class="pad guide-row">
        <div class="guide-face" style="width:64px;height:64px;font-size:22px">
          <img v-if="u.avatar" :src="u.avatar" :alt="u.nickname" />
          <span v-else>{{ (u.nickname || "友").slice(0, 1) }}</span>
        </div>
        <div>
          <div class="row">
            <strong style="font-size:18px">{{ u.nickname }}</strong>
            <span class="tag" v-if="u.lifeStage">{{ u.lifeStage }}</span>
          </div>
          <p class="muted" style="margin:6px 0 0">
            {{ genderText(u.gender) }}<template v-if="u.hometown"> · {{ u.hometown }}</template>
            · 已出行 {{ u.tripCount }} 次
          </p>
        </div>
      </div>
    </div>
    <p class="muted">公开资料不含手机号与精确年龄，仅展示年龄段。</p>
  </div>
  <p v-else-if="err" class="muted">{{ err }}</p>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http from "@/api/http";
import { genderText } from "@/utils/labels";

const route = useRoute();
const u = ref(null);
const err = ref("");

onMounted(async () => {
  try {
    u.value = (await http.get("/users/" + route.params.id)).data;
  } catch (e) {
    err.value = e.message || "用户不存在";
  }
});
</script>
