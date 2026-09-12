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

    <el-dialog v-model="show" :title="form.id ? '编辑线路' : '新增线路'" width="760px" align-center :close-on-click-modal="false">
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
        <el-form-item label="天数">
          <el-select v-model="form.days" class="field-select">
            <el-option :value="1" label="1日" />
            <el-option :value="2" label="2日" />
            <el-option :value="3" label="3日" />
            <el-option :value="5" label="多日" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.category" class="field-select" clearable filterable allow-create default-first-option placeholder="可不选">
            <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="地区">
          <el-select v-model="form.region" class="field-select" clearable filterable allow-create default-first-option placeholder="可不选">
            <el-option v-for="r in regionOptions" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="难度">
          <el-select v-model="form.difficulty" class="field-select" clearable filterable allow-create default-first-option placeholder="可不选">
            <el-option v-for="d in difficultyOptions" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="成团人数"><el-input-number v-model="form.minGroupSize" /></el-form-item>
        <el-form-item label="介绍"><el-input type="textarea" :rows="4" v-model="form.description" /></el-form-item>
        <el-form-item label="图文介绍">
          <div class="story-list">
            <div v-for="(block, i) in form.story || []" :key="block._key" class="story-block">
              <div class="story-tools">
                <span class="muted" style="margin:0">{{ block.type === "image" ? "图" : "字" }} {{ i + 1 }}</span>
                <el-button link :disabled="i === 0" @click="moveStory(i, -1)">上移</el-button>
                <el-button link :disabled="i === (form.story || []).length - 1" @click="moveStory(i, 1)">下移</el-button>
                <el-button link type="danger" @click="removeStory(i)">删除</el-button>
              </div>
              <el-input v-if="block.type === 'text'" type="textarea" :rows="3" v-model="block.body" placeholder="这一段讲什么" />
              <div v-else class="story-photo">
                <el-upload :show-file-list="false" accept="image/jpeg,image/png,image/webp,image/gif" :http-request="(opt) => uploadStory(i, opt)">
                  <el-image v-if="block.url" :src="block.url" fit="cover" class="story-preview" />
                  <el-button v-else>选图</el-button>
                </el-upload>
                <el-input v-model="block.caption" placeholder="图说，可空" />
              </div>
            </div>
          </div>
          <div class="story-add">
            <el-button @click="addStory('text')">加一段字</el-button>
            <el-button @click="addStory('image')">加一张图</el-button>
            <el-button link @click="fillStory">按介绍和相册生成</el-button>
          </div>
          <div class="muted">按顺序图文交错。留空时用户端会自动用介绍分段，夹相册前几张。</div>
        </el-form-item>
        <el-form-item label="行程">
          <div v-for="(it, i) in form.itinerary || []" :key="it._key" class="itin-edit">
            <div class="itin-head">
              <el-input v-model="it.time" placeholder="07:30" style="width:100px" />
              <el-input v-model="it.title" placeholder="这一站" />
              <el-button link :disabled="i === 0" @click="moveItin(i, -1)">上移</el-button>
              <el-button link type="danger" @click="removeItin(i)">删除</el-button>
            </div>
            <el-input type="textarea" :rows="2" v-model="it.detail" placeholder="怎么走、停多久" />
            <div class="cover-row" style="margin-top:8px">
              <el-upload :show-file-list="false" accept="image/jpeg,image/png,image/webp,image/gif" :http-request="(opt) => uploadItin(i, opt)">
                <el-image v-if="it.photo" :src="it.photo" fit="cover" class="itin-preview" />
                <el-button v-else>这一站配图</el-button>
              </el-upload>
              <el-button v-if="it.photo" link type="danger" @click="it.photo = ''">移除</el-button>
            </div>
          </div>
          <el-button @click="addItin">加一站</el-button>
        </el-form-item>
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
import { ROUTE_CATEGORIES, ROUTE_DIFFICULTIES, ROUTE_REGIONS, mergeOptions } from "@/utils/routeMeta";
import { composeStory } from "@/utils/story";

let blockSeed = 1;
function nextKey() {
  blockSeed += 1;
  return `b${blockSeed}`;
}

const list = ref([]);
const show = ref(false);
const form = ref({});
const tiersText = ref("[]");
const galleryList = computed(() =>
  (form.value.gallery || []).map((url, i) => ({ name: `photo-${i + 1}`, url, uid: `${i}-${url}` }))
);
const categoryOptions = computed(() => mergeOptions(ROUTE_CATEGORIES, list.value.map((r) => r.category), form.value.category));
const regionOptions = computed(() => mergeOptions(ROUTE_REGIONS, list.value.map((r) => r.region), form.value.region));
const difficultyOptions = computed(() => mergeOptions(ROUTE_DIFFICULTIES, list.value.map((r) => r.difficulty), form.value.difficulty));

async function load() {
  list.value = (await http.get("/admin/routes")).data;
}
onMounted(load);

function openCreate() {
  form.value = { days: 1, minGroupSize: 10, category: "", region: "", difficulty: "", tags: [], highlights: [], itinerary: [], story: [], cover: "", gallery: [], meetupPoints: [], buses: ["bus30"], status: "on" };
  tiersText.value = JSON.stringify([{ minPeople: 10, price: 199, memberPrice: 189 }, { minPeople: 20, price: 179, memberPrice: 170 }, { minPeople: 30, price: 159, memberPrice: 151 }, { minPeople: 50, price: 139, memberPrice: 132 }], null, 2);
  show.value = true;
}
function edit(row) {
  form.value = {
    ...row,
    gallery: [...(row.gallery || [])],
    story: (row.story || []).map((b) => ({ ...b, _key: nextKey() })),
    itinerary: (row.itinerary || []).map((it) => ({ photo: "", ...it, _key: nextKey() })),
  };
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
    const url = await postImage(opt.file);
    form.value.cover = url;
    opt.onSuccess?.({ url });
  } catch (e) {
    ElMessage.error(e.message);
    opt.onError?.(e);
  }
}

async function uploadGallery(opt) {
  try {
    const url = await postImage(opt.file);
    form.value.gallery = [...(form.value.gallery || []), url];
    opt.onSuccess?.({ url });
  } catch (e) {
    ElMessage.error(e.message);
    opt.onError?.(e);
  }
}

function removeGallery(file) {
  form.value.gallery = (form.value.gallery || []).filter((url) => url !== file.url);
}

function addStory(type) {
  const block = type === "image" ? { type: "image", url: "", caption: "", _key: nextKey() } : { type: "text", body: "", _key: nextKey() };
  form.value.story = [...(form.value.story || []), block];
}
function removeStory(i) {
  form.value.story = (form.value.story || []).filter((_, idx) => idx !== i);
}
function moveStory(i, dir) {
  const list = [...(form.value.story || [])];
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  form.value.story = list;
}
function fillStory() {
  form.value.story = composeStory(form.value.description, form.value.gallery).map((b) => ({ ...b, _key: nextKey() }));
}
async function uploadStory(i, opt) {
  try {
    const url = await postImage(opt.file);
    const list = [...(form.value.story || [])];
    list[i] = { ...list[i], url };
    form.value.story = list;
    opt.onSuccess?.({ url });
  } catch (e) {
    ElMessage.error(e.message);
    opt.onError?.(e);
  }
}
function addItin() {
  form.value.itinerary = [...(form.value.itinerary || []), { time: "", title: "", detail: "", photo: "", _key: nextKey() }];
}
function removeItin(i) {
  form.value.itinerary = (form.value.itinerary || []).filter((_, idx) => idx !== i);
}
function moveItin(i, dir) {
  const list = [...(form.value.itinerary || [])];
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  form.value.itinerary = list;
}
async function uploadItin(i, opt) {
  try {
    const url = await postImage(opt.file);
    const list = [...(form.value.itinerary || [])];
    list[i] = { ...list[i], photo: url };
    form.value.itinerary = list;
    opt.onSuccess?.({ url });
  } catch (e) {
    ElMessage.error(e.message);
    opt.onError?.(e);
  }
}

async function save() {
  try {
    form.value.priceTiers = JSON.parse(tiersText.value);
    if (!form.value.cover && form.value.gallery?.[0]) form.value.cover = form.value.gallery[0];
    if (form.value.id) await http.put("/admin/routes/" + form.value.id, form.value);
    else await http.post("/admin/routes", form.value);
    show.value = false;
    ElMessage.success("已保存");
    load();
  } catch (e) {
    ElMessage.error(e.message || "保存失败");
  }
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
.field-select {
  width: 100%;
}
.story-list,
.itin-edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.story-block,
.itin-edit {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px;
  background: #fafafa;
}
.story-tools,
.itin-head,
.story-add {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.story-preview,
.itin-preview {
  width: 160px;
  height: 100px;
  border-radius: 8px;
  display: block;
}
.story-photo {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.muted {
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
  margin-top: 6px;
}
</style>
