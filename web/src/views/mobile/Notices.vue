<template>
  <section class="notice-page">
    <header class="notice-heading">
      <div><p class="notice-eyebrow">MESSAGE CENTER</p><h1>消息中心</h1><p class="notice-subtitle">重要进展，及时知晓</p></div>
      <button class="notice-read-all" type="button" :disabled="!unread || readingAll" @click="readAll">{{ readingAll ? '正在标记' : '全部标为已读' }}</button>
    </header>
    <nav class="notice-tabs" aria-label="消息状态">
      <button v-for="tab in tabs" :key="tab.key" type="button" :class="{ selected: filter === tab.key }" :aria-pressed="filter === tab.key" @click="selectFilter(tab.key)">{{ tab.label }}<span>{{ counts[tab.key] }}</span></button>
    </nav>
    <LoadRow v-if="loading" />
    <template v-else>
      <div v-if="error" class="notice-error" role="alert"><span>{{ error }}</span><button type="button" @click="load()">重新加载</button></div>
      <button v-for="n in list" :key="n.id" class="notice-card" :class="{ 'is-unread': n.unread }" type="button" @click="open(n)">
        <span class="notice-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 7 5a2 2 0 0 0 2 0l7-5"/></svg></span>
        <span class="notice-content"><span class="notice-card-heading"><strong>{{ n.title }}</strong><span v-if="n.unread" class="notice-dot" aria-label="未读"></span></span><span class="notice-body">{{ n.body }}</span><span class="notice-meta"><time>{{ n.createdAt }}</time><span>{{ n.unread ? '未读' : '已读' }}</span></span></span>
      </button>
      <div v-if="!list.length && !error" class="notice-empty"><span class="notice-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 7 5a2 2 0 0 0 2 0l7-5"/></svg></span><h2>{{ filter === 'unread' ? '暂时没有未读消息' : filter === 'read' ? '暂时没有已读消息' : '暂时没有消息' }}</h2><p>成团、集合点变更、审核结果和退款到账会出现在这里。</p></div>
      <button v-if="hasMore" class="notice-more" type="button" :disabled="loadingMore" @click="load(true)">{{ loadingMore ? '正在加载' : '加载更多消息' }}</button>
      <p v-else-if="list.length" class="notice-end">已显示全部消息</p>
    </template>
  </section>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import LoadRow from "@/components/LoadRow.vue";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const tabs = [{ key: 'all', label: '全部' }, { key: 'unread', label: '未读' }, { key: 'read', label: '已读' }];
const list = ref([]);
const unread = ref(0);
const counts = ref({ all: 0, unread: 0, read: 0 });
const filter = ref('all');
const loading = ref(true);
const loadingMore = ref(false);
const readingAll = ref(false);
const error = ref('');
const hasMore = ref(false);
const nextCursor = ref(null);
let requestId = 0;
let alive = true;
let opening = false;
const validAccount = token => alive && token === store.token;

onMounted(() => load());
onBeforeUnmount(() => { alive = false; requestId++; });
watch(() => store.token, () => {
  requestId++;
  list.value = [];
  unread.value = 0;
  counts.value = { all: 0, unread: 0, read: 0 };
  filter.value = 'all';
  readingAll.value = false;
  hasMore.value = false;
  nextCursor.value = null;
  load();
});

async function load(more = false) {
  if (more && (loading.value || loadingMore.value || !hasMore.value)) return;
  if (!requireLogin(store, router, route)) { loading.value = false; return; }
  const token = store.token;
  const id = ++requestId;
  const params = { read: filter.value };
  if (more && nextCursor.value) params.beforeId = nextCursor.value;
  loading.value = !more;
  loadingMore.value = !!more;
  error.value = '';
  try {
    const res = await http.get('/me/notices', { params });
    if (id !== requestId || !validAccount(token)) return;
    const rows = res.data || [];
    list.value = more ? list.value.concat(rows.filter(row => !list.value.some(item => item.id === row.id))) : rows;
    unread.value = res.unread || 0;
    counts.value = res.counts || { all: list.value.length, unread: unread.value, read: 0 };
    hasMore.value = !!res.hasMore;
    nextCursor.value = res.nextCursor || null;
  } catch (err) {
    if (id === requestId && validAccount(token)) error.value = err.message || '消息加载失败，请重试';
  } finally {
    if (id === requestId && validAccount(token)) { loading.value = false; loadingMore.value = false; }
  }
}

function selectFilter(key) {
  if (!tabs.some(tab => tab.key === key) || filter.value === key) return;
  filter.value = key;
  list.value = [];
  hasMore.value = false;
  nextCursor.value = null;
  return load();
}

async function readAll() {
  if (readingAll.value || !unread.value) return;
  const token = store.token;
  const selectedFilter = filter.value;
  readingAll.value = true;
  try {
    const res = await http.post('/me/notices/read-all', { read: selectedFilter });
    if (!validAccount(token)) return;
    unread.value = res.unread || 0;
    counts.value = res.counts || counts.value;
    if (selectedFilter !== filter.value) {
      await load();
    } else {
      requestId++;
      list.value = res.data || [];
      hasMore.value = !!res.hasMore;
      nextCursor.value = res.nextCursor || null;
      loading.value = false;
      loadingMore.value = false;
      error.value = '';
    }
  } catch (err) {
    if (validAccount(token)) error.value = '标记失败，请重试';
  } finally {
    if (validAccount(token)) readingAll.value = false;
  }
}

async function open(n) {
  if (opening) return;
  const token = store.token;
  const selectedFilter = filter.value;
  opening = true;
  try {
    if (n.unread) {
      try {
        const res = await http.post('/me/notices/' + n.id + '/read');
        if (!validAccount(token)) return;
        unread.value = res.unread || 0;
        counts.value = res.counts || counts.value;
        if (selectedFilter !== filter.value || loading.value || loadingMore.value) {
          await load();
        } else {
          list.value = list.value.map(row => row.id === n.id ? { ...row, unread: false } : row).filter(row => filter.value !== 'unread' || row.unread);
        }
      } catch (err) {
        if (validAccount(token)) error.value = '标记失败，请重试';
      }
    }
    if (validAccount(token) && n.href && n.href.startsWith('/m/')) router.push(n.href);
  } finally { opening = false; }
}
</script>

<style scoped>
.notice-page{color:#292630;padding:4px 0 28px;--notice-purple:#5b3b8c;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",sans-serif}.notice-page button{font:inherit;cursor:pointer}.notice-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 2px 24px}.notice-eyebrow{margin:0;color:#9b8bab;font-size:9px;font-weight:600;letter-spacing:2px}.notice-heading h1{margin:6px 0 0;font-size:24px;font-weight:650;letter-spacing:.5px}.notice-subtitle{margin:6px 0 0;color:#92909b;font-size:12px}.notice-read-all{flex-shrink:0;padding:10px 2px;border:0;background:none;color:var(--notice-purple);font-size:12px!important}.notice-read-all:disabled{opacity:.4;cursor:default}.notice-tabs{display:flex;gap:4px;padding:4px;margin-bottom:16px;background:#eeebf3;border-radius:12px}.notice-tabs button{display:flex;flex:1;align-items:center;justify-content:center;gap:6px;padding:10px 4px;border:0;border-radius:9px;background:none;color:#8e8798;font-size:14px}.notice-tabs button span{font-size:11px}.notice-tabs button.selected{color:var(--notice-purple);background:white;font-weight:600;box-shadow:0 2px 6px #3d2a570d}.notice-card{display:flex;width:100%;gap:12px;padding:17px 15px;margin:0 0 10px;border:1px solid #efedf3;border-radius:18px;background:#fff;text-align:left;color:inherit}.notice-symbol{display:flex;flex-shrink:0;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;background:#f4f1f8;color:#a395b6}.notice-symbol svg{width:23px;height:23px}.is-unread .notice-symbol{background:#eee6f7;color:var(--notice-purple)}.notice-content{flex:1;min-width:0}.notice-card-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.notice-card-heading strong{font-size:15px;font-weight:600;line-height:1.5}.notice-dot{flex-shrink:0;width:6px;height:6px;background:var(--notice-purple);border-radius:50%}.notice-body{display:block;margin-top:5px;color:#807b89;font-size:13px;line-height:1.75;overflow-wrap:anywhere}.notice-meta{display:flex;justify-content:space-between;gap:6px;margin-top:12px;color:#aaa5b1;font-size:10px}.notice-meta>span{flex-shrink:0}.is-unread .notice-meta>span{color:#8a70aa}.notice-empty{text-align:center;padding:45px 20px;color:#a09aa9;font-size:13px;line-height:1.8}.notice-empty .notice-symbol{margin:0 auto 16px;width:54px;height:54px;border-radius:18px}.notice-empty h2{margin:0 0 8px;color:#746b80;font-size:16px;font-weight:500}.notice-empty p{margin:0}.notice-error{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;border-radius:12px;background:#fff;padding:14px;margin-bottom:12px;color:#8e7f9f;font-size:13px}.notice-error button{border:0;background:none;color:var(--notice-purple)}.notice-more{display:block;width:100%;border:0;background:none;text-align:center;color:var(--notice-purple);padding:16px;font-size:13px}.notice-end{text-align:center;padding:16px;color:#b2aabd;font-size:12px}.notice-page button:focus-visible{outline:2px solid #9c80c0;outline-offset:3px}
</style>
