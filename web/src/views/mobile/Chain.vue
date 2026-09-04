<template>
  <div>
    <div class="chips">
      <div class="chip" :class="{ on: type === '' }" @click="type = ''">全部</div>
      <div class="chip" :class="{ on: type === 'individual' }" @click="type = 'individual'">个人拼团</div>
      <div class="chip" :class="{ on: type === 'company' }" @click="type = 'company'">公司团</div>
      <div class="offer-chip publish" @click="$router.push('/m/publish')">发团</div>
    </div>
    <div class="card" v-for="s in filtered" :key="s.id" @click="$router.push('/m/schedule/' + s.id)">
      <div class="pad">
        <div class="row">
          <strong>
            <span class="offer-chip inline" :style="{ background: s.offerColor }">{{ s.offerLabel }}</span>
            <span v-if="s.eligibility?.label" class="offer-chip inline" style="background:#1d4e89">{{ s.eligibility.label }}</span>
            {{ s.route.title }}
          </strong>
          <span class="tag">{{ s.startDate }}</span>
        </div>
        <div class="tag-row">
          <span class="play-tag sm" v-for="t in s.playTags || []" :key="t.id" :style="{ background: t.color }">{{ t.name }}</span>
        </div>
        <div class="muted">{{ s.organizerType === "company" ? s.companyName : s.organizerName }} · {{ s.bus?.name }}<template v-if="s.guaranteed"> · 铁定出发</template></div>
        <p v-if="s.guide" class="guide-hit" @click.stop="$router.push('/m/guide/' + s.guide.id)">导游 {{ s.guide.name }} · 查看详情</p>
        <p v-else class="muted guide-hit" @click.stop="$router.push('/m/guides')">成团后匹配导游 · 先看看领队</p>
        <div class="progress"><i :style="{ width: Math.min(100, (s.enrolled / s.maxSeats) * 100) + '%' }"></i></div>
        <div class="row muted">
          <span>{{ s.enrolled }}/{{ s.maxSeats }} · 成团{{ s.minGroupSize }}</span>
          <span>
            <s v-if="s.quote.originPrice > s.quote.price" class="price-origin">¥{{ s.quote.originPrice }}</s>
            ¥{{ s.quote.price }}
          </span>
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
