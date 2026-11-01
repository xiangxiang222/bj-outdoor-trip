<template>
  <div class="legal-page">
    <p v-if="loading" class="legal-state" role="status">正在加载协议…</p>
    <div v-else-if="error" class="legal-state" role="alert">
      <p>{{ error }}</p><button type="button" class="btn ghost" @click="load">重新加载</button>
    </div>
    <template v-else-if="bundle">
      <aside v-if="bundle.status === 'draft'" class="legal-notice" role="note">
        {{ bundle.notice || '当前内容为审阅版，尚未正式生效。' }}
        <button v-if="usingReview" class="legal-review-refresh" type="button" @click="load">重新加载最新内容</button>
      </aside>
      <p class="legal-meta">版本 {{ bundle.version }} · 更新于 {{ bundle.updatedAt }}<template v-if="bundle.effectiveAt"> · 生效于 {{ bundle.effectiveAt }}</template></p>
      <template v-if="!activeDoc">
        <p class="legal-intro">了解服务约定、个人信息处理方式，以及如何管理你的信息与授权。</p>
        <nav class="legal-documents" aria-label="协议与隐私文件">
          <a v-for="doc in bundle.documents" :key="doc.id" :href="'/m/legal/' + doc.id" @click.prevent="navigateDoc(doc.id)">
            <span><strong>{{ doc.title }}</strong><small>{{ doc.summary }}</small></span><span aria-hidden="true">›</span>
          </a>
        </nav>
        <section class="legal-section">
          <h2>运营者与联系方式</h2>
          <dl class="legal-fields">
            <template v-for="field in operatorFields" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value || '待补充' }}</dd></template>
          </dl>
        </section>
      </template>
      <article v-else-if="document" class="legal-document">
        <a class="legal-back" href="/m/legal" @click.prevent="navigateDoc('')">‹ 全部协议与清单</a>
        <h2 class="legal-title">{{ document.title }}</h2>
        <p class="legal-intro">{{ document.summary }}</p>
        <nav class="legal-toc" aria-label="本文目录">
          <span>本文目录</span>
          <a v-for="(section, index) in document.sections" :key="section.id || index" :href="'#legal-section-' + index" @click.prevent="goSection(index)">{{ section.title }}</a>
        </nav>
        <section v-for="(section, index) in document.sections" :id="'legal-section-' + index" :key="section.id || index" class="legal-section">
          <h3>{{ section.title }}</h3>
          <p v-for="(paragraph, p) in section.paragraphs || []" :key="p">{{ paragraph }}</p>
          <div v-for="(entry, e) in section.entries || []" :key="e" class="legal-entry">
            <h4>{{ entry.title }}</h4>
            <dl class="legal-fields"><template v-for="(field, f) in entry.fields || []" :key="f"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></template></dl>
          </div>
          <template v-for="(link, l) in section.links || []" :key="l">
            <a v-if="safeLegalUrl(link.url)" class="legal-source" :href="safeLegalUrl(link.url)" target="_blank" rel="noopener noreferrer">{{ link.label }} ↗</a>
          </template>
        </section>
        <a class="legal-back" href="/m/legal" @click.prevent="navigateDoc('')">查看其他协议与清单 ›</a>
      </article>
      <div v-else class="legal-state"><p>未找到该协议</p><a href="/m/legal" @click.prevent="navigateDoc('')">返回协议与隐私</a></div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { setChrome } from "@/utils/pageChrome";
import { safeLegalUrl, validateLegalBundle } from "@/utils/legal";
import reviewBundle from "@/data/legal-review.json";

const props = defineProps({ docId: { type: String, default: null } });
const emit = defineEmits(["navigate"]);
const route = useRoute();
const router = useRouter();
const activeDoc = computed(() => props.docId === null ? route.params.doc : props.docId);
const bundle = ref(null);
const loading = ref(true);
const error = ref("");
const usingReview = ref(false);
const document = computed(() => bundle.value?.documents.find((doc) => doc.id === activeDoc.value));
const operatorFields = computed(() => [
  { label: "运营主体", value: bundle.value?.operator?.name },
  { label: "联系地址", value: bundle.value?.operator?.address },
  { label: "隐私联系邮箱", value: bundle.value?.operator?.email },
  { label: "联系电话", value: bundle.value?.operator?.phone },
]);
function updateChrome() { if (props.docId !== null) return; setChrome(document.value?.title || "协议与隐私", "服务约定与个人信息保护"); }
async function load() {
  loading.value = true;
  error.value = "";
  bundle.value = null;
  usingReview.value = false;
  try { bundle.value = validateLegalBundle((await http.get("/legal")).data); }
  catch (e) {
    if (e.status === 404) {
      try {
        const review = validateLegalBundle(reviewBundle);
        if (review.status !== "draft" || review.effectiveAt !== null || review.reviewOnly !== true) throw new Error("审阅内容暂不可用，请重试");
        bundle.value = review;
        usingReview.value = true;
      } catch (reviewError) { error.value = reviewError.message || "审阅内容暂不可用，请重试"; }
    } else error.value = e.message || "协议加载失败，请重试";
  }
  finally { loading.value = false; updateChrome(); }
}
function goSection(index) { window.document.getElementById("legal-section-" + index)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
function navigateDoc(id) {
  if (props.docId !== null) emit("navigate", id);
  else router.push("/m/legal" + (id ? "/" + id : ""));
}
watch(activeDoc, updateChrome, { flush: "post" });
onMounted(load);
</script>

<style scoped>
.legal-page { max-width: 800px; margin: 0 auto; padding-bottom: 28px; color: var(--ink, #33283b); }
.legal-notice { padding: 16px; border: 1px solid #e3cba0; border-radius: 12px; background: #fff8e9; color: #75551e; font-size: calc(13px * var(--ui-scale)); line-height: 1.8; }
.legal-review-refresh { display: block; margin-top: 10px; padding: 4px 0; border: 0; background: none; color: inherit; font: inherit; text-decoration: underline; text-underline-offset: 4px; cursor: pointer; }
.legal-meta { color: var(--muted); font-size: calc(12px * var(--ui-scale)); line-height: 1.8; }
.legal-intro { line-height: 1.9; color: var(--muted); }
.legal-documents { border: 1px solid var(--line, #e7e0eb); border-radius: 14px; overflow: hidden; background: var(--card, #fff); }
.legal-documents a { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 19px 18px; color: inherit; text-decoration: none; border-bottom: 1px solid var(--line, #e7e0eb); }
.legal-documents a:last-child { border-bottom: none; }
.legal-documents strong, .legal-documents small { display: block; }
.legal-documents strong { font-size: calc(15px * var(--ui-scale)); }
.legal-documents small { margin-top: 7px; color: var(--muted); font-size: calc(12px * var(--ui-scale)); line-height: 1.7; }
.legal-title { font-size: calc(23px * var(--ui-scale)); line-height: 1.5; margin: 22px 0 8px; }
.legal-back, .legal-source, .legal-toc a { color: var(--leaf, #5b3b8c); text-underline-offset: 4px; }
.legal-back { display: inline-block; margin: 8px 0; font-size: calc(13px * var(--ui-scale)); }
.legal-toc { padding: 18px; margin: 24px 0; border-radius: 12px; background: var(--card, #fff); border: 1px solid var(--line, #e7e0eb); }
.legal-toc span { font-weight: 650; display: block; margin-bottom: 10px; }
.legal-toc a { display: block; padding: 5px 0; line-height: 1.7; font-size: calc(13px * var(--ui-scale)); }
.legal-section { margin: 24px 0; scroll-margin-top: 20px; }
.legal-section h2, .legal-section h3 { font-size: calc(17px * var(--ui-scale)); line-height: 1.6; margin: 0 0 14px; }
.legal-section p { white-space: pre-line; overflow-wrap: anywhere; font-size: calc(14px * var(--ui-scale)); line-height: 2; margin: 12px 0; }
.legal-entry { margin: 14px 0; padding: 17px; border: 1px solid var(--line, #e7e0eb); border-radius: 12px; background: var(--card, #fff); }
.legal-entry h4 { font-size: calc(14px * var(--ui-scale)); margin: 0 0 12px; line-height: 1.7; }
.legal-fields { margin: 0; font-size: calc(13px * var(--ui-scale)); line-height: 1.9; }
.legal-fields dt { margin-top: 10px; font-weight: 650; color: var(--muted); }
.legal-fields dt:first-child { margin-top: 0; }
.legal-fields dd { margin: 2px 0 0; overflow-wrap: anywhere; white-space: pre-line; }
.legal-source { display: block; font-size: calc(13px * var(--ui-scale)); margin-top: 12px; overflow-wrap: anywhere; }
.legal-state { text-align: center; padding: 36px 18px; line-height: 1.9; }
</style>
