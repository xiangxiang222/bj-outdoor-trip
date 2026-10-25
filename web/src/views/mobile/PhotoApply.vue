<template>
  <div>
    <p class="muted">摄影师免个人团费，保险另计。一个团只设一位。</p>
    <LoadRow v-if="!loaded" />
    <button v-for="s in trips" :key="s.id" class="photo-trip" type="button" @click="$router.push('/m/schedule/' + s.id)">
      <img v-if="s.route && s.route.cover" :src="s.route.cover" alt="" />
      <span>
        <strong>{{ s.route && s.route.title }}</strong>
        <em>{{ s.startDate }} 出发</em>
      </span>
    </button>
    <p v-if="loaded && !trips.length" class="muted">这几天没有空着的摄影师位。</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import http from "@/api/http";
import LoadRow from "@/components/LoadRow.vue";

const trips = ref([]);
const loaded = ref(false);

onMounted(async () => {
  try {
    trips.value = (await http.get("/schedules?photoOpen=1&channel=trip")).data || [];
  } catch {
    trips.value = [];
  } finally {
    loaded.value = true;
  }
});
</script>
