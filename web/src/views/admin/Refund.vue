<template>
  <div>
    <div class="row">
      <h2>退费规则</h2>
      <div>
        <el-button @click="reset">恢复默认</el-button>
        <el-button type="success" :loading="saving" @click="save">保存全局规则</el-button>
      </div>
    </div>
    <p class="muted">默认所有线路使用这里的比例。某一条线要不同规则，去「线路管理」关掉「使用全局退费规则」。</p>
    <p v-if="summary" class="muted">{{ summary }}</p>
    <el-card shadow="never">
      <RefundRulesEditor v-model="tiers" />
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import http from "@/api/http";
import RefundRulesEditor from "@/components/RefundRulesEditor.vue";

const tiers = ref([]);
const defaults = ref([]);
const summary = ref("");
const saving = ref(false);

function cloneTiers(list) {
  return (list || []).map((t) => ({ minDays: t.minDays, percent: t.percent }));
}

async function load() {
  const res = await http.get("/admin/refund-rules");
  const data = res.data || {};
  tiers.value = cloneTiers(data.tiers);
  defaults.value = cloneTiers(data.defaults);
  summary.value = data.summary || "";
}

onMounted(load);

async function save() {
  saving.value = true;
  try {
    const res = await http.put("/admin/refund-rules", { tiers: tiers.value });
    const data = res.data || {};
    tiers.value = cloneTiers(data.tiers);
    summary.value = data.summary || "";
    ElMessage.success("已保存全局退费规则");
  } catch (e) {
    ElMessage.error(e.message || "保存失败");
  } finally {
    saving.value = false;
  }
}

async function reset() {
  saving.value = true;
  try {
    const res = await http.put("/admin/refund-rules", { reset: true });
    const data = res.data || {};
    tiers.value = cloneTiers(data.tiers || defaults.value);
    summary.value = data.summary || "";
    ElMessage.success("已恢复默认：10 天 100%、3 天 80%、当天未开团 50%");
  } catch (e) {
    ElMessage.error(e.message || "恢复失败");
  } finally {
    saving.value = false;
  }
}
</script>
