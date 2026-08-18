<template>
  <div>
    <div class="row">
      <h2>线路管理</h2>
      <el-button type="success" @click="openCreate">新增线路</el-button>
    </div>
    <el-table :data="list" stripe>
      <el-table-column label="封面" width="88">
        <template #default="{ row }">
          <el-image v-if="row.cover" :src="row.cover" fit="cover" style="width:64px;height:40px;border-radius:6px" />
          <span v-else class="muted">无</span>
        </template>
      </el-table-column>
      <el-table-column prop="code" label="编号" width="80" />
      <el-table-column prop="title" label="标题" min-width="180" />
      <el-table-column prop="days" label="天数" width="70" />
      <el-table-column prop="category" label="类型" width="90" />
      <el-table-column prop="region" label="地区" width="140" />
      <el-table-column prop="minGroupSize" label="成团" width="80" />
      <el-table-column prop="status" label="状态" width="80" />
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button size="small" @click="edit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="off(row)">下架</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="show" :title="form.id ? '编辑线路' : '新增线路'" width="760px">
      <el-form label-width="100px">
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="副标题"><el-input v-model="form.subtitle" /></el-form-item>
        <el-form-item label="封面">
          <div class="cover-row">
            <el-upload :show-file-list="false" accept="image/jpeg,image/png,image/webp,image/gif" :http-request="uploadCover">
              <el-image v-if="form.cover" :src="form.cover" fit="cover" class="cover-preview" />
              <el-button v-else>选择封面照片</el-button>
            </el-upload>
            <el-button v-if="form.cover" link type="danger" @click="form.cover = ''">移除</el-button>
          </div>
          <div class="muted">支持 jpg / png / webp / gif，单张不超过 5MB。点预览图可更换。</div>
        </el-form-item>
        <el-form-item label="相册">
          <el-upload
            list-type="picture-card"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            :file-list="galleryList"
            :http-request="uploadGallery"
            :on-remove="removeGallery"
          >
            <span>上传</span>
          </el-upload>
          <div class="muted">可多选。未单独设封面时，会用相册第一张当封面。</div>
        </el-form-item>
        <el-form-item label="天数"><el-select v-model="form.days"><el-option v-for="n in [1,2,3,5]" :key="n" :label="n+'日'" :value="n" /></el-select></el-form-item>
        <el-form-item label="类型"><el-input v-model="form.category" /></el-form-item>
        <el-form-item label="地区"><el-input v-model="form.region" /></el-form-item>
        <el-form-item label="难度"><el-input v-model="form.difficulty" /></el-form-item>
        <el-form-item label="成团人数"><el-input-number v-model="form.minGroupSize" /></el-form-item>
        <el-form-item label="介绍"><el-input type="textarea" :rows="4" v-model="form.description" /></el-form-item>
        <el-form-item label="费用含"><el-input type="textarea" v-model="form.feeInclude" /></el-form-item>
        <el-form-item label="费用不含"><el-input type="textarea" v-model="form.feeExclude" /></el-form-item>
        <el-form-item label="阶梯价 JSON"><el-input type="textarea" :rows="4" v-model="tiersText" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="show=false">取消</el-button>
        <el-button type="success" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import http from "@/api/http";

const list = ref([]);
const show = ref(false);
const form = ref({});
const tiersText = ref("[]");
const galleryList = computed(() =>
  (form.value.gallery || []).map((url, i) => ({ name: `photo-${i + 1}`, url, uid: `${i}-${url}` }))
);

async function load() {
  list.value = (await http.get("/admin/routes")).data;
}
onMounted(load);

function openCreate() {
  form.value = { days: 1, minGroupSize: 10, category: "山水", difficulty: "休闲", tags: [], highlights: [], itinerary: [], cover: "", gallery: [], meetupPoints: [], buses: ["bus30"], status: "on" };
  tiersText.value = JSON.stringify([{ minPeople: 10, price: 199, memberPrice: 183 }, { minPeople: 20, price: 179, memberPrice: 165 }, { minPeople: 30, price: 159, memberPrice: 146 }, { minPeople: 50, price: 139, memberPrice: 128 }], null, 2);
  show.value = true;
}
function edit(row) {
  form.value = { ...row, gallery: [...(row.gallery || [])] };
  tiersText.value = JSON.stringify((row.priceTiers || []).map((t) => ({ minPeople: t.min_people || t.minPeople, price: t.price, memberPrice: t.member_price || t.memberPrice })), null, 2);
  show.value = true;
}

async function postImage(file) {
  const data = new FormData();
  data.append("file", file);
  const res = await http.post("/admin/upload", data);
  return res.data.url;
}

async function uploadCover(opt) {
  try {
    form.value.cover = await postImage(opt.file);
    opt.onSuccess?.({});
  } catch (e) {
    ElMessage.error(e.message);
    opt.onError?.(e);
  }
}

async function uploadGallery(opt) {
  try {
    const url = await postImage(opt.file);
    form.value.gallery = [...(form.value.gallery || []), url];
    opt.onSuccess?.({});
  } catch (e) {
    ElMessage.error(e.message);
    opt.onError?.(e);
  }
}

function removeGallery(file) {
  form.value.gallery = (form.value.gallery || []).filter((url) => url !== file.url);
}

async function save() {
  form.value.priceTiers = JSON.parse(tiersText.value);
  if (!form.value.cover && form.value.gallery?.[0]) form.value.cover = form.value.gallery[0];
  if (form.value.id) await http.put("/admin/routes/" + form.value.id, form.value);
  else await http.post("/admin/routes", form.value);
  show.value = false;
  ElMessage.success("已保存");
  load();
}
async function off(row) {
  await http.delete("/admin/routes/" + row.id);
  ElMessage.success("已下架");
  load();
}
</script>

<style scoped>
.cover-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cover-preview {
  width: 160px;
  height: 100px;
  border-radius: 8px;
  display: block;
}
.muted {
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
  margin-top: 6px;
}
</style>
