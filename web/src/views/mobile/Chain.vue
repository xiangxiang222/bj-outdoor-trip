<template>
  <div>
    <div class="chips">
      <div class="chip" :class="{ on: type === '' }" @click="type = ''">全部</div>
      <div class="chip" :class="{ on: type === 'individual' }" @click="type = 'individual'">个人拼团</div>
      <div class="chip" :class="{ on: type === 'company' }" @click="type = 'company'">公司团</div>
    </div>
    <div class="card" v-for="s in filtered" :key="s.id" @click="$router.push('/m/schedule/' + s.id)">
      <div class="pad">
        <div class="row">
          <strong>{{ s.route.title }}</strong>
          <span class="tag">{{ s.startDate }}</span>
        </div>
        <div class="muted">{{ s.organizerType === "company" ? s.companyName : s.organizerName }} · {{ s.bus?.name }}</div>
        <div class="progress"><i :style="{ width: Math.min(100, (s.enrolled / s.maxSeats) * 100) + '%' }"></i></div>
        <div class="row muted">
          <span>{{ s.enrolled }}/{{ s.maxSeats }} · 成团{{ s.minGroupSize }}</span>
          <span>¥{{ s.quote.price }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import http from "@/api/http";
const list = ref([]);
const type = ref("");
const filtered = computed(() => (type.value ? list.value.filter((s) => s.organizerType === type.value) : list.value));
onMounted(async () => {
  list.value = (await http.get("/schedules")).data;
});
</script>
