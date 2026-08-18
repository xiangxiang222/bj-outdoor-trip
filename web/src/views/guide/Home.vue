<template>
  <div>
    <div class="card" style="background:linear-gradient(135deg,#1b4332,#40916c);color:#fff">
      <div class="pad">
        <div class="row">
          <strong>{{ me.name || "导游" }}</strong>
          <button class="btn ghost" style="padding:4px 10px" @click="out">退出</button>
        </div>
        <p class="muted" style="color:rgba(255,255,255,.8)">{{ me.specialties }} · {{ me.years }}年</p>
      </div>
    </div>
    <div class="card tap" v-for="s in list" :key="s.id" @click="$router.push('/g/schedule/' + s.id)">
      <div class="pad">
        <div class="row">
          <strong>{{ s.route.title }}</strong>
          <span class="tag">{{ s.startDate }}</span>
        </div>
        <div class="muted">{{ s.enrolled }}/{{ s.maxSeats }} · {{ s.meetupPoint }} {{ s.meetupTime }}</div>
      </div>
    </div>
    <p v-if="!list.length" class="muted">暂无已分配行程。人数成团后会自动匹配。</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";

const router = useRouter();
const me = ref({});
const list = ref([]);

onMounted(async () => {
  try {
    me.value = (await http.get("/guide/me")).data;
    list.value = (await http.get("/guide/schedules")).data;
  } catch {
    out();
  }
});

function out() {
  localStorage.removeItem("bj_guide_token");
  localStorage.removeItem("bj_guide_name");
  router.push("/g/login");
}
</script>
