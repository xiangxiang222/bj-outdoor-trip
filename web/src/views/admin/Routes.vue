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
      <el-table-column prop="region" label="地区" min-width="160" />
      <el-table-column prop="minGroupSize" label="成团" width="80" />
      <el-table-column prop="status" label="状态" width="80" />
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button size="small" @click="edit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="off(row)">下架</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="show" :title="form.id ? '编辑线路' : '新增线路'" width="880px" top="4vh" align-center :close-on-click-modal="false">
      <el-form label-width="100px">
        <div class="sec">基本信息</div>
        <el-form-item label="填写方式">
          <el-radio-group v-model="composeMode">
            <el-radio-button label="manual">手动</el-radio-button>
            <el-radio-button label="ai">AI 起草</el-radio-button>
          </el-radio-group>
          <div v-if="composeMode === 'ai'" class="muted">先填标题和地区，点生成。文案和照片会填进下面，可再改。</div>
        </el-form-item>
        <el-form-item label="标题"><el-input v-model="form.title" placeholder="例如：慕田峪长城缆车一日游" /></el-form-item>
        <el-form-item label="副标题"><el-input v-model="form.subtitle" placeholder="一句话卖点，可空" /></el-form-item>
        <el-form-item label="上架">
          <el-switch v-model="form.status" active-value="on" inactive-value="off" />
          <span class="inline-hint">关掉后用户端不再展示，已有拼团还在。</span>
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
          <el-cascader
            v-model="regionPath"
            class="field-select"
            :options="chinaAreaOptions"
            :props="regionProps"
            filterable
            clearable
            placeholder="选省、市或县，也可选北京周边 / 跨省"
            @change="onRegionPick"
          />
        </el-form-item>
        <template v-if="composeMode === 'ai'">
          <el-form-item label="补充">
            <el-input type="textarea" :rows="2" v-model="draftNotes" placeholder="想强调亲子、避暑、不走夜路等，可空" />
          </el-form-item>
          <el-form-item label="起草">
            <el-button type="success" :loading="drafting" @click="generateDraft">生成文案和图片</el-button>
            <span class="inline-hint">未配置 AI_API_KEY 时用模板写文案。图片先用已有景点库，再搜公开图库。</span>
          </el-form-item>
        </template>
        <el-form-item label="难度">
          <el-select v-model="form.difficulty" class="field-select" clearable filterable allow-create default-first-option placeholder="可不选">
            <el-option v-for="d in difficultyOptions" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="季节">
          <el-select v-model="form.season" class="field-select" clearable filterable allow-create default-first-option placeholder="例如 4-10月">
            <el-option v-for="s in seasonOptions" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="里程">
          <el-input-number v-model="form.distanceKm" :min="0" :max="3000" />
          <span class="inline-hint">公里，可空。</span>
        </el-form-item>
        <el-form-item label="成团人数"><el-input-number v-model="form.minGroupSize" :min="1" :max="80" /></el-form-item>
        <el-form-item label="标签">
          <el-select v-model="form.tags" class="field-select" multiple filterable allow-create default-first-option placeholder="可多选，也可自己打字新建">
            <el-option v-for="t in tagOptions" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>

        <div class="sec">照片</div>
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

        <div class="sec">介绍</div>
        <el-form-item label="介绍"><el-input type="textarea" :rows="4" v-model="form.description" placeholder="给用户看的线路说明，可分段" /></el-form-item>
        <el-form-item label="亮点">
          <div class="list-edit">
            <div v-for="(h, i) in form.highlights" :key="'h' + i" class="line-row">
              <el-input v-model="form.highlights[i]" :placeholder="'亮点 ' + (i + 1)" />
              <el-button link type="danger" @click="removeHighlight(i)">删除</el-button>
            </div>
            <el-button @click="addHighlight">加一条亮点</el-button>
          </div>
        </el-form-item>
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

        <div class="sec">行程</div>
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

        <div class="sec">价格与车型</div>
        <el-form-item label="阶梯价">
          <div class="list-edit">
            <div v-for="(tier, i) in form.priceTiers" :key="'tier' + i" class="tier-row">
              <el-input-number v-model="tier.minPeople" :min="1" :max="200" controls-position="right" />
              <span class="tier-lab">人起</span>
              <el-input-number v-model="tier.price" :min="0" :max="99999" controls-position="right" @change="fillMember(tier)" />
              <span class="tier-lab">元</span>
              <span class="tier-lab dim">会员</span>
              <el-input-number v-model="tier.memberPrice" :min="0" :max="99999" controls-position="right" />
              <el-button link type="danger" @click="removeTier(i)">删除</el-button>
            </div>
            <div class="story-add">
              <el-button @click="addTier">加一档</el-button>
              <el-button link @click="fillDefaultTiers">填四档模板</el-button>
            </div>
            <div class="muted">人越多越便宜。改单价会按 95 折重算会员价，也可手改。前台展示也会按会员折扣重算。</div>
          </div>
        </el-form-item>
        <el-form-item label="可选车型">
          <el-checkbox-group v-model="form.buses">
            <el-checkbox v-for="b in buses" :key="b.id" :label="b.id">{{ b.name }}（{{ b.seats }} 座）</el-checkbox>
          </el-checkbox-group>
          <div class="muted">发团时只能从这里选。至少勾一辆。</div>
        </el-form-item>

        <div class="sec">集合点</div>
        <el-form-item label="集合点">
          <div class="list-edit">
            <div v-for="(p, i) in form.meetupPoints" :key="p._key" class="meetup-card">
              <div class="itin-head">
                <el-input v-model="p.name" placeholder="地点名称，例如东直门东方银座C口" />
                <el-button link type="danger" @click="removeMeetup(i)">删除</el-button>
              </div>
              <div class="meetup-grid">
                <el-input v-model="p.timeHint" placeholder="集合时间，如 07:30" />
                <el-input v-model="p.geo" placeholder="怎么找，如地铁2号线东直门站C口" />
              </div>
            </div>
            <div class="story-add">
              <el-button @click="addMeetup()">加一个集合点</el-button>
              <el-select v-model="meetupPreset" class="preset-select" placeholder="加常用点" @change="addPresetMeetup">
                <el-option v-for="p in COMMON_MEETUPS" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
            </div>
          </div>
        </el-form-item>

        <div class="sec">费用与须知</div>
        <el-form-item label="费用含"><el-input type="textarea" :rows="2" v-model="form.feeInclude" placeholder="车、司机、保险等" /></el-form-item>
        <el-form-item label="费用不含"><el-input type="textarea" :rows="2" v-model="form.feeExclude" placeholder="门票、餐食等" /></el-form-item>
        <el-form-item label="装备"><el-input type="textarea" :rows="2" v-model="form.equipment" placeholder="运动鞋、防晒帽。用户端会按顿号拆成装备清单" /></el-form-item>
        <el-form-item label="注意事项"><el-input type="textarea" :rows="2" v-model="form.notices" placeholder="台阶陡、带身份证等" /></el-form-item>
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
import {
  COMMON_MEETUPS,
  COMMON_ROUTE_TAGS,
  ROUTE_CATEGORIES,
  ROUTE_DIFFICULTIES,
  ROUTE_SEASONS,
  defaultPriceTiers,
  memberPriceOf,
  mergeOptions,
  normalizePriceTiers,
  serializeMeetupPoints,
  serializePriceTiers,
} from "@/utils/routeMeta";
import { chinaAreaOptions, findRegionPath, formatRegion } from "@/utils/chinaAreas";
import { composeStory } from "@/utils/story";

let blockSeed = 1;
function nextKey() {
  blockSeed += 1;
  return `b${blockSeed}`;
}

const list = ref([]);
const buses = ref([]);
const show = ref(false);
const form = ref({});
const meetupPreset = ref("");
const composeMode = ref("manual");
const draftNotes = ref("");
const drafting = ref(false);
const regionPath = ref([]);
const regionProps = { checkStrictly: true, expandTrigger: "click" };
const galleryList = computed(() =>
  (form.value.gallery || []).map((url, i) => ({ name: `photo-${i + 1}`, url, uid: `${i}-${url}` }))
);
const categoryOptions = computed(() => mergeOptions(ROUTE_CATEGORIES, list.value.map((r) => r.category), form.value.category));
const difficultyOptions = computed(() => mergeOptions(ROUTE_DIFFICULTIES, list.value.map((r) => r.difficulty), form.value.difficulty));
const seasonOptions = computed(() => mergeOptions(ROUTE_SEASONS, list.value.map((r) => r.season), form.value.season));
const tagOptions = computed(() => mergeOptions(COMMON_ROUTE_TAGS, ...list.value.map((r) => r.tags || []), form.value.tags || []));

function applyRegion(text) {
  const path = findRegionPath(text);
  regionPath.value = path;
  form.value.region = path.length ? formatRegion(path) : String(text || "");
}

function onRegionPick(path) {
  form.value.region = formatRegion(path);
}

async function load() {
  list.value = (await http.get("/admin/routes")).data;
}
async function loadBuses() {
  buses.value = (await http.get("/buses")).data || [];
}
onMounted(() => {
  load();
  loadBuses();
});

function blankForm() {
  return {
    days: 1,
    minGroupSize: 10,
    category: "",
    region: "",
    difficulty: "",
    season: "四季",
    distanceKm: 0,
    tags: [],
    highlights: [],
    itinerary: [],
    story: [],
    cover: "",
    gallery: [],
    meetupPoints: [],
    buses: ["bus30"],
    status: "on",
    priceTiers: defaultPriceTiers(),
    title: "",
    subtitle: "",
    description: "",
    feeInclude: "",
    feeExclude: "",
    equipment: "",
    notices: "",
  };
}

function openCreate() {
  form.value = blankForm();
  composeMode.value = "ai";
  draftNotes.value = "";
  applyRegion("");
  show.value = true;
}
function edit(row) {
  form.value = {
    ...blankForm(),
    ...row,
    gallery: [...(row.gallery || [])],
    tags: [...(row.tags || [])],
    highlights: [...(row.highlights || [])],
    story: (row.story || []).map((b) => ({ ...b, _key: nextKey() })),
    itinerary: (row.itinerary || []).map((it) => ({ photo: "", ...it, _key: nextKey() })),
    meetupPoints: (row.meetupPoints || []).map((p) => ({ ...p, _key: nextKey() })),
    buses: [...(row.buses || [])],
    priceTiers: normalizePriceTiers(row.priceTiers).length ? normalizePriceTiers(row.priceTiers) : defaultPriceTiers(),
    status: row.status || "on",
  };
  composeMode.value = "manual";
  draftNotes.value = "";
  applyRegion(row.region);
  show.value = true;
}

async function generateDraft() {
  if (!String(form.value.title || "").trim()) {
    ElMessage.error("请先填标题");
    return;
  }
  drafting.value = true;
  try {
    const res = await http.post(
      "/admin/routes/draft",
      {
        title: form.value.title,
        region: form.value.region,
        days: form.value.days,
        category: form.value.category,
        notes: draftNotes.value,
      },
      { timeout: 45000 }
    );
    const d = res.data || {};
    const gallery = Array.isArray(d.gallery) ? d.gallery : [];
    form.value.subtitle = d.subtitle || form.value.subtitle;
    form.value.category = d.category || form.value.category;
    form.value.season = d.season || form.value.season;
    form.value.difficulty = d.difficulty || form.value.difficulty;
    if (d.distanceKm != null) form.value.distanceKm = d.distanceKm;
    if (d.tags?.length) form.value.tags = d.tags;
    form.value.description = d.description || form.value.description;
    if (d.highlights?.length) form.value.highlights = d.highlights;
    if (d.itinerary?.length) {
      form.value.itinerary = d.itinerary.map((it, i) => ({
        photo: "",
        ...it,
        photo: it.photo || gallery[i] || "",
        _key: nextKey(),
      }));
    }
    form.value.feeInclude = d.feeInclude || form.value.feeInclude;
    form.value.feeExclude = d.feeExclude || form.value.feeExclude;
    form.value.equipment = d.equipment || form.value.equipment;
    form.value.notices = d.notices || form.value.notices;
    if (d.cover) form.value.cover = d.cover;
    if (gallery.length) form.value.gallery = gallery;
    if (form.value.description && gallery.length) {
      form.value.story = composeStory(form.value.description, gallery).map((b) => ({ ...b, _key: nextKey() }));
    }
    if (!gallery.length) {
      ElMessage.warning("文案已出，公开图库没搜到照片，请自己上传封面");
    } else {
      ElMessage.success(d.source === "llm" ? "已用 AI 起草，请核对后再保存" : "已用模板起草，请核对后再保存");
    }
  } catch (e) {
    ElMessage.error(e.message || "起草失败");
  } finally {
    drafting.value = false;
  }
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
  const next = [...(form.value.story || [])];
  const j = i + dir;
  if (j < 0 || j >= next.length) return;
  [next[i], next[j]] = [next[j], next[i]];
  form.value.story = next;
}
function fillStory() {
  form.value.story = composeStory(form.value.description, form.value.gallery).map((b) => ({ ...b, _key: nextKey() }));
}
async function uploadStory(i, opt) {
  try {
    const url = await postImage(opt.file);
    const next = [...(form.value.story || [])];
    next[i] = { ...next[i], url };
    form.value.story = next;
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
  const next = [...(form.value.itinerary || [])];
  const j = i + dir;
  if (j < 0 || j >= next.length) return;
  [next[i], next[j]] = [next[j], next[i]];
  form.value.itinerary = next;
}
async function uploadItin(i, opt) {
  try {
    const url = await postImage(opt.file);
    const next = [...(form.value.itinerary || [])];
    next[i] = { ...next[i], photo: url };
    form.value.itinerary = next;
    opt.onSuccess?.({ url });
  } catch (e) {
    ElMessage.error(e.message);
    opt.onError?.(e);
  }
}

function addHighlight() {
  form.value.highlights = [...(form.value.highlights || []), ""];
}
function removeHighlight(i) {
  form.value.highlights = (form.value.highlights || []).filter((_, idx) => idx !== i);
}
function fillMember(tier) {
  tier.memberPrice = memberPriceOf(tier.price);
}
function addTier() {
  const last = (form.value.priceTiers || []).at(-1);
  const minPeople = last ? Number(last.minPeople) + 10 : 10;
  const price = last ? Math.max(0, Number(last.price) - 20) : 199;
  form.value.priceTiers = [...(form.value.priceTiers || []), { minPeople, maxPeople: null, price, memberPrice: memberPriceOf(price) }];
}
function removeTier(i) {
  form.value.priceTiers = (form.value.priceTiers || []).filter((_, idx) => idx !== i);
}
function fillDefaultTiers() {
  form.value.priceTiers = defaultPriceTiers();
}
function addMeetup(preset) {
  form.value.meetupPoints = [...(form.value.meetupPoints || []), { id: "", name: "", timeHint: "", geo: "", ...preset, _key: nextKey() }];
}
function addPresetMeetup(id) {
  const preset = COMMON_MEETUPS.find((p) => p.id === id);
  meetupPreset.value = "";
  if (!preset) return;
  if ((form.value.meetupPoints || []).some((p) => p.id === preset.id || p.name === preset.name)) return;
  addMeetup(preset);
}
function removeMeetup(i) {
  form.value.meetupPoints = (form.value.meetupPoints || []).filter((_, idx) => idx !== i);
}

async function save() {
  try {
    if (!String(form.value.title || "").trim()) {
      ElMessage.error("请填写标题");
      return;
    }
    const priceTiers = serializePriceTiers(form.value.priceTiers);
    if (!priceTiers.length) {
      ElMessage.error("请至少填一档人数价");
      return;
    }
    if (!(form.value.buses || []).length) {
      ElMessage.error("请勾选至少一种车型");
      return;
    }
    if (!form.value.cover && form.value.gallery?.[0]) form.value.cover = form.value.gallery[0];
    const payload = {
      ...form.value,
      title: String(form.value.title).trim(),
      tags: (form.value.tags || []).map((t) => String(t).trim()).filter(Boolean),
      highlights: (form.value.highlights || []).map((h) => String(h).trim()).filter(Boolean),
      priceTiers,
      meetupPoints: serializeMeetupPoints(form.value.meetupPoints),
      buses: form.value.buses || [],
    };
    if (form.value.id) await http.put("/admin/routes/" + form.value.id, payload);
    else await http.post("/admin/routes", payload);
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
.sec {
  margin: 8px 0 14px;
  padding-bottom: 6px;
  border-bottom: 1px solid #ebeef5;
  font-weight: 600;
  color: #303133;
}
.list-edit,
.story-list,
.itin-edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.story-block,
.itin-edit,
.meetup-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px;
  background: #fafafa;
}
.story-tools,
.itin-head,
.story-add,
.line-row,
.tier-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.story-add,
.itin-head {
  margin-bottom: 8px;
}
.line-row {
  width: 100%;
}
.line-row .el-input {
  flex: 1;
}
.tier-lab {
  color: #606266;
  font-size: 13px;
}
.tier-lab.dim {
  color: #909399;
}
.inline-hint {
  margin-left: 10px;
  color: #909399;
  font-size: 12px;
}
.meetup-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 8px;
}
.preset-select {
  width: 220px;
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
