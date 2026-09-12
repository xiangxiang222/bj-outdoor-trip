<template>
  <el-dialog v-model="open" :title="title" width="920px" top="6vh" destroy-on-close @closed="emit('closed')">
    <p class="muted" style="margin-top:0">
      圆盘上的结果由服务器先算出来，再转到对应扇区。指定名单用户看不到。中奖后用户能看到奖品和这档中奖率；积分/实物等跟团结束后才能领。权重大小即相对中奖率，库存用尽后该奖不再随机抽中。
    </p>
    <el-form label-width="96px" v-if="form">
      <el-form-item label="启用">
        <el-switch v-model="form.enabled" />
        <span class="muted" style="margin-left:8px">关闭时前台仍用平台默认奖池</span>
      </el-form-item>
      <el-form-item label="抽奖时机">
        <el-radio-group v-model="form.drawMode">
          <el-radio label="pre">报名前</el-radio>
          <el-radio label="enroll">报名后</el-radio>
          <el-radio label="both">前后都抽</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="标题">
        <el-input v-model="form.title" maxlength="40" style="width:240px" />
      </el-form-item>
      <el-form-item label="转动秒数">
        <el-input-number v-model="form.spinSeconds" :min="2" :max="10" />
        <span class="muted" style="margin-left:8px">建议 5 秒</span>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.note" placeholder="仅后台可见" />
      </el-form-item>
    </el-form>

    <div class="row" style="margin:8px 0 12px">
      <strong>奖品</strong>
      <div>
        <el-button size="small" @click="useTemplate(3)">套用 3 个奖</el-button>
        <el-button size="small" @click="useTemplate(5)">套用 5 个奖</el-button>
        <el-button size="small" type="success" @click="addPrize">加一个</el-button>
      </div>
    </div>
    <el-table :data="form.prizes" size="small" stripe>
      <el-table-column label="名称" min-width="140">
        <template #default="{ row }"><el-input v-model="row.name" /></template>
      </el-table-column>
      <el-table-column label="等级" width="110">
        <template #default="{ row }">
          <el-select v-model="row.level">
            <el-option :value="1" label="一等奖" />
            <el-option :value="2" label="二等奖" />
            <el-option :value="3" label="三等奖" />
            <el-option :value="4" label="普通" />
            <el-option :value="9" label="谢谢参与" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="120">
        <template #default="{ row }">
          <el-select v-model="row.kind">
            <el-option value="physical" label="实物" />
            <el-option value="points" label="积分" />
            <el-option value="coupon" label="优惠券" />
            <el-option value="thanks" label="谢谢参与" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="积分" width="100">
        <template #default="{ row }"><el-input-number v-model="row.points" :min="0" :controls="false" /></template>
      </el-table-column>
      <el-table-column label="权重" width="100">
        <template #default="{ row }"><el-input-number v-model="row.weight" :min="0" :controls="false" /></template>
      </el-table-column>
      <el-table-column label="中奖率" width="80">
        <template #default="{ row }">{{ rate(row) }}%</template>
      </el-table-column>
      <el-table-column label="库存" width="110">
        <template #default="{ row }">
          <el-input-number v-model="row.stock" :min="-1" :controls="false" />
          <div class="muted" style="font-size:12px">-1 不限</div>
        </template>
      </el-table-column>
      <el-table-column label="颜色" width="88">
        <template #default="{ row }"><el-color-picker v-model="row.color" /></template>
      </el-table-column>
      <el-table-column width="56">
        <template #default="{ $index }">
          <el-button link type="danger" @click="form.prizes.splice($index, 1)">删</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="row" style="margin:20px 0 12px">
      <strong>指定中奖</strong>
    </div>
    <p class="muted">指定后该用户抽到的一定是这档奖，转盘动画和别人一样。每人本团只能指定一次。</p>
    <div class="row" style="gap:8px;margin-bottom:12px">
      <el-select v-model="assignUserId" filterable clearable placeholder="本团报名用户" style="width:220px">
        <el-option v-for="u in form.enrolled" :key="u.id" :label="(u.nickname || '用户') + ' ' + u.phone" :value="u.id" />
      </el-select>
      <el-input v-model="assignPhone" placeholder="或填手机号" style="width:150px" maxlength="11" />
      <el-select v-model="assignPrizeId" placeholder="奖品" style="width:160px">
        <el-option v-for="p in form.prizes.filter((x) => x.id)" :key="p.id" :label="p.name" :value="p.id" />
      </el-select>
      <el-input v-model="assignNote" placeholder="备注" style="width:140px" />
      <el-button type="warning" :disabled="!form.prizes.some((p) => p.id)" @click="saveAssign">指定</el-button>
    </div>
    <p v-if="!form.prizes.some((p) => p.id)" class="muted">先保存奖品，才能指定中奖人。</p>
    <el-table :data="form.assigns" size="small" stripe>
      <el-table-column prop="nickname" label="用户" width="120" />
      <el-table-column prop="phone" label="手机" width="130" />
      <el-table-column prop="prizeName" label="奖品" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">{{ row.usedAt ? "已抽走" : "待抽" }}</template>
      </el-table-column>
      <el-table-column prop="note" label="备注" />
      <el-table-column width="70">
        <template #default="{ row }">
          <el-button v-if="!row.usedAt" link type="danger" @click="dropAssign(row)">取消</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="row" style="margin:20px 0 12px"><strong>中奖记录</strong></div>
    <p class="muted">报名前抽的人这里能看出后来有没有报名。保存奖品不会关掉本页，看完整名单也可关了后在列表点「查看」。</p>
    <el-table :data="form.draws" size="small" stripe max-height="240">
      <el-table-column prop="createdAt" label="时间" width="160" />
      <el-table-column prop="nickname" label="用户" width="110" />
      <el-table-column prop="phone" label="手机" width="130" />
      <el-table-column prop="prizeLabel" label="奖品" />
      <el-table-column label="报名" width="130">
        <template #default="{ row }">{{ row.enrollLabel || (row.enrolled ? "已报名" : "未报名") }}</template>
      </el-table-column>
      <el-table-column label="领取" width="80">
        <template #default="{ row }">{{ row.level === 9 ? "—" : row.claimed ? "已领" : "待领" }}</template>
      </el-table-column>
      <el-table-column label="阶段" width="80">
        <template #default="{ row }">{{ row.phase === "post" ? "行后" : "行前" }}</template>
      </el-table-column>
      <el-table-column label="指定" width="70">
        <template #default="{ row }">{{ row.assigned ? "是" : "" }}</template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button @click="open = false">关闭</el-button>
      <el-button type="success" :loading="saving" @click="save">保存奖品</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import http from "@/api/http";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  schedule: { type: Object, default: null },
});
const emit = defineEmits(["update:modelValue", "closed", "saved"]);

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});
const title = computed(() => {
  const s = props.schedule;
  return s ? `抽奖 · ${s.route?.title || ""} ${s.startDate || ""}` : "本团抽奖";
});
const form = ref({
  enabled: false,
  drawMode: "both",
  title: "本团抽奖",
  spinSeconds: 5,
  note: "",
  prizes: [],
  assigns: [],
  draws: [],
  enrolled: [],
});
const saving = ref(false);
const assignUserId = ref(null);
const assignPhone = ref("");
const assignPrizeId = ref(null);
const assignNote = ref("");

function totalWeight() {
  return (form.value.prizes || []).reduce((sum, p) => sum + Number(p.weight || 0), 0);
}
function rate(row) {
  const t = totalWeight();
  if (!t) return 0;
  return Math.round((Number(row.weight || 0) / t) * 1000) / 10;
}

function blankPrize(i, extra = {}) {
  const colors = ["#e1251b", "#f5a623", "#7cb342", "#42a5f5", "#26a69a", "#c8ccc4"];
  return {
    id: 0,
    name: "",
    level: 4,
    kind: "physical",
    points: 0,
    weight: 10,
    stock: -1,
    color: colors[i % colors.length],
    ...extra,
  };
}

function useTemplate(n) {
  if (n === 3) {
    form.value.prizes = [
      blankPrize(0, { name: "一等奖", level: 1, kind: "physical", weight: 5, stock: 1 }),
      blankPrize(1, { name: "二等奖", level: 2, kind: "points", points: 50, weight: 20, stock: -1 }),
      blankPrize(2, { name: "谢谢参与", level: 9, kind: "thanks", weight: 75, stock: -1 }),
    ];
    return;
  }
  form.value.prizes = [
    blankPrize(0, { name: "一等奖", level: 1, kind: "physical", weight: 3, stock: 1 }),
    blankPrize(1, { name: "二等奖", level: 2, kind: "physical", weight: 8, stock: 3 }),
    blankPrize(2, { name: "三等奖", level: 3, kind: "points", points: 100, weight: 15, stock: -1 }),
    blankPrize(3, { name: "20 积分", level: 4, kind: "points", points: 20, weight: 24, stock: -1, prizeKey: "points20" }),
    blankPrize(4, { name: "谢谢参与", level: 9, kind: "thanks", weight: 50, stock: -1, prizeKey: "thanks" }),
  ];
}

function addPrize() {
  if (form.value.prizes.length >= 8) {
    ElMessage.warning("圆盘最多 8 个扇区");
    return;
  }
  form.value.prizes.push(blankPrize(form.value.prizes.length));
}

async function load() {
  if (!props.schedule?.id) return;
  const data = (await http.get(`/admin/schedules/${props.schedule.id}/lottery`)).data;
  form.value = {
    enabled: !!data.enabled,
    drawMode: data.drawMode || "both",
    title: data.title || "本团抽奖",
    spinSeconds: data.spinSeconds || 5,
    note: data.note || "",
    prizes: (data.prizes || []).map((p) => ({ ...p })),
    assigns: data.assigns || [],
    draws: data.draws || [],
    enrolled: data.enrolled || [],
  };
}

async function save() {
  saving.value = true;
  try {
    const data = (
      await http.put(`/admin/schedules/${props.schedule.id}/lottery`, {
        enabled: form.value.enabled,
        drawMode: form.value.drawMode,
        title: form.value.title,
        spinSeconds: form.value.spinSeconds,
        note: form.value.note,
        prizes: form.value.prizes,
      })
    ).data;
    form.value.prizes = data.prizes || [];
    form.value.assigns = data.assigns || [];
    form.value.draws = data.draws || [];
    ElMessage.success("抽奖已保存");
    emit("saved");
  } catch (e) {
    ElMessage.error(e.message || "保存失败");
  } finally {
    saving.value = false;
  }
}

async function saveAssign() {
  try {
    const data = (
      await http.post(`/admin/schedules/${props.schedule.id}/lottery/assigns`, {
        userId: assignUserId.value || undefined,
        phone: assignPhone.value || undefined,
        prizeId: assignPrizeId.value,
        note: assignNote.value,
      })
    ).data;
    form.value.assigns = data.assigns || [];
    assignUserId.value = null;
    assignPhone.value = "";
    assignNote.value = "";
    ElMessage.success("已指定");
  } catch (e) {
    ElMessage.error(e.message || "指定失败");
  }
}

async function dropAssign(row) {
  try {
    const data = (await http.delete(`/admin/schedules/${props.schedule.id}/lottery/assigns/${row.id}`)).data;
    form.value.assigns = data.assigns || [];
  } catch (e) {
    ElMessage.error(e.message || "取消失败");
  }
}

watch(
  () => [props.modelValue, props.schedule?.id],
  ([show]) => {
    if (show && props.schedule?.id) load().catch((e) => ElMessage.error(e.message || "加载失败"));
  },
  { immediate: true }
);
</script>
