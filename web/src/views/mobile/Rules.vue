<template>
  <div>
    <div class="card">
      <div class="pad">
        <strong>{{ rules.title || "各线路公共规则" }}</strong>
        <p class="muted">{{ rules.summary }}</p>
      </div>
    </div>
    <div class="card" v-for="sec in rules.sections || []" :key="sec.title">
      <div class="pad">
        <div class="h2" style="margin-top:0">{{ sec.title }}</div>
        <p v-for="(it, i) in sec.items" :key="i" class="muted">{{ i + 1 }}. {{ it }}</p>
      </div>
    </div>
    <div class="card" v-if="faqs.length">
      <div class="pad">
        <div class="h2" style="margin-top:0">常见问题</div>
        <div class="faq-item" v-for="f in faqs" :key="f.q">
          <strong>{{ f.q }}</strong>
          <p class="muted">{{ f.a }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import http from "@/api/http";

const rules = ref({ title: "", summary: "", sections: [] });
const faqs = ref([]);

onMounted(async () => {
  const meta = (await http.get("/meta")).data || {};
  rules.value = meta.commonRules || rules.value;
  faqs.value = meta.faqs || [];
});
</script>
