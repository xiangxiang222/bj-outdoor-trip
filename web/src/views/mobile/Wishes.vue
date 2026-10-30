<template>
  <main class="wishes-page" :class="'wish-view-' + view" :aria-busy="loading || busy">
    <template v-if="view === 'hub'">
      <section class="wish-hero">
        <div class="wish-hero-copy"><span class="wish-eyebrow">{{ t('日常，也值得被惦记') }}</span><h1>{{ t('意思意思') }}<span class="wish-title-dot">.</span></h1><p>{{ t('把小心意，变成小美好') }}</p><button type="button" class="wish-primary wish-create-entry" @click="goCreate()">{{ t('发起一个小心愿') }}<WishGlyph kind="arrow" /></button></div>
        <div class="wish-hero-art" aria-hidden="true"><span class="wish-art-orbit"></span><span class="wish-art-star">✦</span><span class="wish-art-label">{{ t('一份心意') }}</span><span class="wish-art-ticket"><WishGlyph kind="other" /><i></i><b>FOR YOU</b></span><span class="wish-art-heart"><WishGlyph kind="heart" /></span></div>
      </section>

      <section class="wish-ideas" aria-labelledby="wish-ideas-title"><div class="wish-section-heading"><h2 id="wish-ideas-title">{{ t('从一件小事开始') }}</h2><span>{{ t('选一份你想要的美好') }}</span></div><div class="wish-category-grid"><button v-for="category in everydayCategories" :key="category.key" type="button" class="wish-category" :data-wish-kind="category.key" @click="goCreate(category.key)"><span class="wish-category-icon"><WishGlyph :kind="category.key" /></span><strong>{{ t(category.label) }}</strong><small>{{ t(category.tagline || category.description) }}</small></button></div><button type="button" class="wish-trip-entry" data-wish-kind="trip" @click="goCreate('trip')"><span class="wish-trip-mark"><WishGlyph kind="trip" /></span><span><strong>{{ t('下一程，一起意思意思') }}</strong><small>{{ t('关联已有报名，邀请朋友分摊团费') }}</small></span><WishGlyph kind="arrow" /></button></section>

      <section class="wish-mine" aria-labelledby="wish-mine-title"><div class="wish-section-heading"><h2 id="wish-mine-title">{{ t('我的心意簿') }}</h2><span>{{ t('每一份惦记，都有回音') }}</span></div><div class="wish-list-tabs" role="tablist" :aria-label="t('我的心愿')"><button v-for="tab in tabs" :key="tab.key" type="button" role="tab" class="wish-list-tab" :data-tab="tab.key" :aria-selected="listTab === tab.key" :class="{ on: listTab === tab.key }" @click="changeTab(tab.key)">{{ t(tab.title) }}</button></div>
        <div v-if="!store.token" class="wish-empty"><span class="wish-empty-glyph"><WishGlyph kind="heart" /></span><h3>{{ t('登录，收好每一份心意') }}</h3><p>{{ t('发起心愿、认领安排，和熟悉的人分享小美好。') }}</p><button type="button" class="wish-secondary" @click="login(route.fullPath)">{{ t('登录后查看') }}</button></div>
        <p v-else-if="listLoading" class="wish-loading" role="status">{{ t('正在翻开心意簿…') }}</p><div v-else-if="listError && !items.length" class="wish-error" role="alert"><p>{{ listError }}</p><button type="button" class="wish-retry" @click="loadList(false)">{{ t('重新加载') }}</button></div>
        <div v-else-if="!items.length" class="wish-empty"><span class="wish-empty-glyph"><WishGlyph kind="other" /></span><h3>{{ t(listTab === 'created' ? '把想要的小美好，说出来' : '下一份心意，等你来参与') }}</h3><p>{{ t(listTab === 'created' ? '一杯奶茶、一顿晚饭，或下一次一起出发。' : '打开朋友分享的心愿，就能认领安排或送上祝福。') }}</p><button v-if="listTab === 'created'" type="button" class="wish-secondary" @click="goCreate()">{{ t('写下第一个心愿') }}</button></div>
        <div v-else class="wish-list"><button v-for="item in items" :key="item.token" type="button" class="wish-list-card" @click="openWish(item.token)"><span class="wish-list-icon"><WishGlyph :kind="item.kind" /></span><span class="wish-list-copy"><span class="wish-list-top"><small>{{ t(categoryFor(item.kind).label) }}</small><em :class="{ finished: item.status !== 'open' }">{{ t(stateLabel(item)) }}</em></span><strong>{{ item.title }}</strong><span>{{ t('送给') }} {{ item.recipientName || t('自己') }}<span class="wish-list-date"> · {{ dateText(item.createdAt) }}</span></span></span><span class="wish-list-arrow" aria-hidden="true">›</span></button></div><p v-if="items.length && listError" class="wish-feedback error" role="alert">{{ listError }}</p><button v-if="store.token && items.length && hasMore" type="button" class="wish-load-more" :disabled="listLoading || moreLoading" @click="loadList(true)">{{ moreLoading ? t('正在翻开下一页…') : t('查看更多心意') }}</button>
      </section>
      <p class="wish-page-note">{{ t('心愿认领由朋友自行安排；旅行付款仅用于关联的真实订单。') }}</p>
    </template>

    <template v-else-if="view === 'new'">
      <header class="wish-form-heading"><span class="wish-eyebrow">{{ t('小小心愿，认真对待') }}</span><h1>{{ t('这次，想要什么小美好') }}</h1><p>{{ t('说给熟悉的人听，让心意有个落点。') }}</p></header>
      <form class="wish-form" @submit.prevent="createWish">
        <fieldset class="wish-kind-field"><legend>{{ t('选一种心意') }}</legend><div class="wish-kind-options"><button v-for="category in categories" :key="category.key" type="button" :data-wish-kind="category.key" :class="{ on: form.kind === category.key }" :aria-pressed="form.kind === category.key" :disabled="busy" @click="selectKind(category.key)"><WishGlyph :kind="category.key" /><span>{{ t(category.label) }}</span></button></div></fieldset>
        <section v-if="form.kind === 'trip'" class="wish-order-choice" aria-labelledby="wish-order-mode-title"><h2 id="wish-order-mode-title">{{ t('这份旅行心意') }}</h2><div class="wish-order-modes"><button type="button" :class="{ on: !linkOrder }" :aria-pressed="!linkOrder" :disabled="busy" @click="linkOrder = false; form.enrollmentId = ''">{{ t('先许个旅行心愿') }}<small>{{ t('认领安排，无需付款') }}</small></button><button type="button" :class="{ on: linkOrder }" :aria-pressed="linkOrder" :disabled="busy" @click="chooseOrderMode">{{ t('关联已报名的行程') }}<small>{{ t('邀请朋友分摊团费') }}</small></button></div><template v-if="linkOrder"><p v-if="ordersLoading" class="wish-loading" role="status">{{ t('正在查找可关联的报名…') }}</p><div v-else-if="ordersError" class="wish-error" role="alert"><p>{{ ordersError }}</p><button type="button" class="wish-retry" @click="loadOrders">{{ t('重新加载') }}</button></div><template v-else><label class="wish-field" for="wish-order"><span>{{ t('选择一份真实报名') }}</span><select id="wish-order" v-model="form.enrollmentId" :disabled="busy"><option value="">{{ t(orders.length ? '请选择已报名的行程' : '暂无可关联的报名') }}</option><option v-for="item in orders" :key="orderId(item)" :value="String(orderId(item))">{{ item.title }} · {{ item.recipientName || item.travelerName }} · {{ dateText(item.startDate, false) }}</option></select></label><div v-if="selectedOrder" class="wish-selected-order"><WishGlyph kind="trip" /><span><strong>{{ selectedOrder.title }}</strong><small>{{ t('出行人') }} · {{ orderRecipient }}<template v-if="selectedOrder.startDate"> · {{ dateText(selectedOrder.startDate, false) }}</template></small></span><b>¥{{ money(selectedOrder.remainAmount) }}<small>{{ t('待付团费') }}</small></b></div><p class="wish-field-help">{{ t('付款直接抵扣这份报名的团费，不会增加席位。') }}</p></template></template></section>
        <label class="wish-field" for="wish-recipient"><span>{{ t('这份心意，送给谁') }}<small>{{ t('留空送给自己') }}</small></span><input id="wish-recipient" v-model="form.recipientName" type="text" maxlength="20" :readonly="!!selectedOrder" :disabled="busy" :placeholder="t('如：自己、小林、今天的寿星')" autocomplete="off" /><small v-if="selectedOrder" class="wish-field-help">{{ t('已使用关联报名的脱敏出行人姓名。') }}</small></label>
        <label class="wish-field" for="wish-title"><span>{{ t('写下你的小心愿') }}<small>{{ form.title.length }}/40</small></span><input id="wish-title" v-model="form.title" type="text" maxlength="40" :disabled="busy" :placeholder="t(categoryFor(form.kind).title)" autocomplete="off" /></label>
        <label class="wish-field" for="wish-note"><span>{{ t('想说的话') }}<small>{{ t('选填') }} · {{ form.note.length }}/240</small></span><textarea id="wish-note" v-model="form.note" maxlength="240" rows="4" :disabled="busy" :placeholder="t('比如哪天有空、口味偏好，或想和谁一起。')"></textarea></label>
        <div class="wish-form-summary"><WishGlyph :kind="selectedOrder ? 'trip' : 'heart'" /><p>{{ t(selectedOrder ? '这份心意关联真实行程订单，朋友可为本订单付款。' : '这是一个无需付款的心愿，朋友可认领并自行安排。') }}</p></div>
        <p v-if="formError" class="wish-feedback error" role="alert">{{ formError }}</p><button type="submit" class="wish-primary wish-create-submit" :disabled="busy || (linkOrder && (ordersLoading || !!ordersError))">{{ busy ? t('正在保存心愿…') : t('写好了，发起心愿') }}<WishGlyph v-if="!busy" kind="arrow" /></button><p class="wish-page-note">{{ t('链接可转发，请勿填写手机号、证件号等敏感信息。') }}</p>
      </form>
    </template>

    <template v-else>
      <p v-if="loading && !wish" class="wish-loading wish-detail-loading" role="status">{{ t('正在打开这份心意…') }}</p><section v-else-if="!wish" class="wish-empty wish-unavailable" role="alert"><span class="wish-empty-glyph"><WishGlyph kind="other" /></span><h1>{{ t('暂时无法打开这份心愿') }}</h1><p>{{ detailError || t('心愿不存在或链接已失效') }}</p><button type="button" class="wish-secondary wish-retry" @click="loadDetail">{{ t('重新加载') }}</button><button type="button" class="wish-text-button" @click="router.push('/m/wishes')">{{ t('去看看其他小美好') }}</button></section>
      <template v-else>
        <div class="wish-detail-topline"><button type="button" class="wish-text-button" @click="router.push('/m/wishes')">{{ t('意思意思') }}<span aria-hidden="true"> / </span>{{ t('一份专属心意') }}</button><button v-if="wish.canClose" type="button" class="wish-text-button wish-close" :disabled="actionsDisabled" @click="ask('close')">{{ t('关闭心愿') }}</button></div>
        <section class="wish-paper" aria-labelledby="wish-detail-title"><div class="wish-paper-top"><span class="wish-paper-category"><WishGlyph :kind="wish.kind" />{{ t(categoryFor(wish.kind).label) }}</span><span class="wish-status" :class="{ finished: wish.status !== 'open' }">{{ t(stateLabel(wish)) }}</span></div><span class="wish-paper-to">{{ t('TO') }} · {{ wish.recipientName || t('自己') }}</span><h1 id="wish-detail-title">{{ wish.title }}</h1><p v-if="wish.note" class="wish-personal-note">{{ wish.note }}</p><div class="wish-paper-footer"><span class="wish-owner-monogram" aria-hidden="true">{{ nameInitial(wish.ownerName) }}</span><span><strong>{{ wish.ownerName || t('同行的朋友') }}</strong><small>{{ dateText(wish.createdAt) }} · {{ t('写下这份心愿') }}</small></span><span class="wish-paper-stamp" aria-hidden="true"><WishGlyph kind="heart" /></span></div></section>

        <div v-if="detailError || loading" class="wish-error wish-detail-refresh" role="status"><p>{{ loading ? t('正在更新心愿…') : detailError }}</p><button v-if="detailError && !loading" type="button" class="wish-retry" :disabled="busy" @click="loadDetail">{{ t('重新加载') }}</button></div>
        <p v-if="notice" class="wish-feedback" role="status">{{ notice }}</p><p v-if="actionError" class="wish-feedback error" role="alert">{{ actionError }}</p>

        <section v-if="wish.order" class="wish-order-panel" aria-labelledby="wish-real-order-title"><div class="wish-section-heading"><h2 id="wish-real-order-title">{{ t('这一程，有你的一份心意') }}</h2><span class="wish-order-state">{{ t(orderState(wish.order)) }}</span></div><div class="wish-real-order"><span class="wish-order-mark"><WishGlyph kind="trip" /></span><div><strong>{{ wish.order.title }}</strong><p><template v-if="wish.order.startDate">{{ dateText(wish.order.startDate, false) }} · </template>{{ t('出行人') }} {{ wish.recipientName }}</p></div></div><div class="wish-order-amount"><div><small>{{ t(wish.order.canPay && wish.status === 'open' ? '待付团费' : '订单团费') }}</small><strong><span>¥</span>{{ money(wish.order.canPay && wish.status === 'open' ? wish.order.remainAmount : wish.order.payAmount) }}</strong></div><p>{{ t('已付') }} ¥{{ money(wish.order.paidAmount) }}<span>{{ t('团费合计') }} ¥{{ money(wish.order.payAmount) }}</span></p></div><div class="wish-progress" role="progressbar" :aria-label="t('团费支付进度')" :aria-valuenow="orderProgress" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: orderProgress + '%' }"></i></div><button v-if="wish.canPay && wish.status === 'open'" type="button" class="wish-primary wish-pay" :disabled="actionsDisabled" @click="goPay">{{ busy ? t('正在打开订单…') : t('为这一程，出一份心意') }}<WishGlyph v-if="!busy" kind="arrow" /></button><button v-else-if="!store.token && wish.status === 'open'" type="button" class="wish-primary wish-pay-login" :disabled="actionsDisabled" @click="login(route.fullPath)">{{ t('登录，参与这份旅行心意') }}<WishGlyph kind="arrow" /></button><p class="wish-field-help">{{ t('每笔付款仅抵扣这份订单，退款按订单规则退回原付款人。') }}</p></section>

        <section v-else class="wish-arrange-panel" aria-labelledby="wish-arrange-title"><span class="wish-arrange-icon"><WishGlyph :kind="wish.claimStatus === 'completed' ? 'check' : 'heart'" /></span><div><span class="wish-eyebrow">{{ t('认领安排 · 无需付款') }}</span><h2 id="wish-arrange-title">{{ arrangeTitle }}</h2><p>{{ arrangeDescription }}</p></div><button v-if="!store.token && wish.status === 'open' && !wish.claimStatus" type="button" class="wish-primary wish-claim" :disabled="actionsDisabled" @click="login(route.fullPath)">{{ t('登录，认领这份小美好') }}<WishGlyph kind="arrow" /></button><button v-else-if="wish.canClaim && wish.status === 'open'" type="button" class="wish-primary wish-claim" :disabled="actionsDisabled" @click="ask('claim')">{{ t('这份小美好，我来安排') }}<WishGlyph kind="arrow" /></button><div v-if="wish.canComplete || wish.canRelease" class="wish-arrange-actions"><button v-if="wish.canComplete" type="button" class="wish-primary wish-complete" :disabled="actionsDisabled" @click="ask('complete')">{{ t('我已安排好') }}<WishGlyph kind="check" /></button><button v-if="wish.canRelease" type="button" class="wish-text-button wish-release" :disabled="actionsDisabled" @click="ask('release')">{{ t('暂时无法安排，归还认领') }}</button></div></section>
        <div v-if="wish.status !== 'open'" class="wish-ended-note"><WishGlyph :kind="wish.status === 'completed' ? 'check' : 'other'" /><p>{{ t(wish.status === 'closed' ? '心愿已关闭，已留下的心意仍会保存在这里。' : '这份心愿已标记完成，谢谢每一份惦记。') }}</p></div>

        <button v-if="wish.status === 'open'" type="button" class="wish-share" :disabled="sharing || busy || loading || !!detailError" @click="shareWish"><span>{{ sharing ? t('准备分享…') : t('把这份心愿，分享给朋友') }}</span><span aria-hidden="true">↗</span></button>
        <div v-if="shareFallback" class="wish-share-fallback"><label for="wish-share-url">{{ t('复制这个链接，分享给朋友') }}</label><input id="wish-share-url" :value="shareFallback" readonly @focus="$event.target.select()" /><button type="button" class="wish-text-button" @click="shareFallback = ''">{{ t('收起') }}</button></div>

        <section class="wish-blessings" aria-labelledby="wish-bless-title"><div class="wish-section-heading"><h2 id="wish-bless-title">{{ t('心意留言') }}<small v-if="wish.blessings?.length">{{ wish.blessings.length }}</small></h2><span>{{ t('一句惦记，也是心意') }}</span></div><form v-if="wish.canBless && wish.status === 'open'" class="wish-blessing-form" @submit.prevent="sendBlessing"><label class="sr-only" for="wish-blessing">{{ t('送上你的祝福') }}</label><textarea id="wish-blessing" v-model="blessingMessage" class="wish-blessing-input" rows="2" maxlength="80" :disabled="actionsDisabled" :placeholder="t('留一句祝福，把好心情也送给 TA')"></textarea><div><span>{{ blessingMessage.length }}/80</span><button type="submit" class="wish-bless-submit" :disabled="actionsDisabled || !blessingMessage.trim()">{{ t('送上心意') }}<span aria-hidden="true">↗</span></button></div></form><p v-if="wish.canBless && wish.status === 'open'" class="wish-bless-help">{{ t('每人可留下一份心意，送出后会保存在这里。') }}</p><p v-else-if="store.token && wish.status === 'open' && (wish.hasBlessed || wish.blessings?.some(item => item.self))" class="wish-bless-help">{{ t('你的心意已送达，愿这份美好如期而至。') }}</p><button v-else-if="!store.token && wish.status === 'open'" type="button" class="wish-bless-login" @click="login(route.fullPath)">{{ t('登录，送上一句祝福') }}<span aria-hidden="true">→</span></button><div v-if="wish.blessings?.length" class="wish-blessing-list"><article v-for="item in wish.blessings" :key="item.id" class="wish-blessing"><span class="wish-blessing-avatar" aria-hidden="true">{{ nameInitial(item.nickname) }}</span><div><header><strong>{{ item.self ? t('你') : item.nickname || t('同行的朋友') }}</strong><time>{{ dateText(item.createdAt) }}</time></header><p>{{ item.message }}</p></div></article></div><p v-else class="wish-no-blessings">{{ t('第一句祝福，也许就来自你。') }}</p></section>
        <p class="wish-page-note">{{ t(wish.order ? '心愿关闭不会取消原报名或发起退款。' : '认领代表愿意自行安排，不代表商家已接单或票券已出票。') }}</p>
      </template>
    </template>

    <dialog ref="confirmDialog" class="wish-confirm" :aria-labelledby="'wish-confirm-title'" @cancel.prevent="cancelConfirm" @click="onDialogClick"><div v-if="confirmation" class="wish-confirm-content"><span class="wish-confirm-icon"><WishGlyph :kind="confirmation.icon" /></span><span class="wish-eyebrow">{{ t('每一份心意，都认真对待') }}</span><h2 id="wish-confirm-title">{{ t(confirmation.title) }}</h2><p>{{ t(confirmation.description) }}</p><p v-if="actionError" class="wish-feedback error" role="alert">{{ actionError }}</p><button type="button" class="wish-primary" :disabled="busy || loading" @click="confirmAction">{{ busy ? t('正在处理…') : t(confirmation.button) }}</button><button type="button" class="wish-text-button" :disabled="busy" @click="cancelConfirm">{{ t('再想想') }}</button></div></dialog>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import http from '@/api/http';
import WishGlyph from '@/components/WishGlyph.vue';
import { useUserStore } from '@/stores/user';
import { readLook } from '@/utils/appearance';
import { translate } from '@/utils/locale';
import { setChrome } from '@/utils/pageChrome';
import { nativeShareSupported } from '@/utils/share';

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const language = ref(readLook().lang);
const onLook = () => { language.value = readLook().lang; updateChrome(); };
window.addEventListener('bj-look', onLook);
function t(text) { return translate(text, language.value); }
const catalog = [
  { key: 'drink', label: '一杯好喝的', title: '想被请一杯喜欢的奶茶', description: '奶茶、咖啡，随心选' },
  { key: 'meal', label: '一起吃顿饭', title: '想和你一起好好吃顿饭', description: '见一面，好好吃饭' },
  { key: 'outing', label: '出去走走', title: '想找一天，一起出去走走', description: '去看看新的风景' },
  { key: 'show', label: '看场演出', title: '想和你分享一场好演出', description: '一起奔赴热爱' },
  { key: 'transport', label: '一张车票', title: '想要一张去见你的车票', description: '让想见，不再遥远' },
  { key: 'trip', label: '一程旅行', title: '下一程，想和你一起出发', description: '下一程，一起出发' },
  { key: 'other', label: '更多小美好', title: '有一份小小的美好想要实现', description: '你的心意，不设题' },
];
for (const item of catalog) item.tagline = item.description;
const categories = ref(catalog);
const everydayCategories = computed(() => categories.value.filter(item => item.key !== 'trip'));
function categoryFor(kind) { return categories.value.find(item => item.key === kind) || catalog[6]; }
const tabs = [{ key: 'created', title: '我发起的' }, { key: 'joined', title: '我参与的' }];
const view = computed(() => route.name === 'wish-new' || route.path === '/m/wishes/new' ? 'new' : route.params.token ? 'detail' : 'hub');
const token = computed(() => String(route.params.token || ''));
let active = true;
let loadVersion = 0;
let listVersion = 0;
let ordersVersion = 0;
let metaVersion = 0;
const context = () => `${route.fullPath}\n${store.token || ''}`;
const isCurrent = key => active && key === context();
const loading = ref(false);
const busy = ref(false);
const sharing = ref(false);
const wish = ref(null);
const detailError = ref('');
const actionError = ref('');
const notice = ref('');
const shareFallback = ref('');
const items = ref([]);
const listTab = ref('created');
const listLoading = ref(false);
const listError = ref('');
const moreLoading = ref(false);
const hasMore = ref(false);
const nextCursor = ref('');
const form = reactive({ kind: 'drink', title: '', recipientName: '', note: '', enrollmentId: '' });
const formError = ref('');
const linkOrder = ref(false);
const orders = ref([]);
const ordersLoading = ref(false);
const ordersError = ref('');
const orderId = item => item.enrollmentId ?? item.id;
const selectedOrder = computed(() => form.kind === 'trip' && linkOrder.value ? orders.value.find(item => String(orderId(item)) === String(form.enrollmentId)) || null : null);
const orderRecipient = computed(() => selectedOrder.value?.recipientName || selectedOrder.value?.travelerName || '');
const actionsDisabled = computed(() => busy.value || loading.value || !!detailError.value);
const blessingMessage = ref('');
let createAttempt = null;
let blessingAttempt = null;
const confirmDialog = ref(null);
const confirmation = ref(null);
let actionSnapshot = null;
const confirmations = {
  claim: { title: '这份小美好，由你安排', description: '认领后，请和发起人自行沟通时间与安排。这里无需付款，也不会替你向商家下单。', button: '确认认领', icon: 'heart' },
  release: { title: '把这份心愿，交还给朋友', description: '归还后，其他朋友可以重新认领。若你已经线下预订或付款，请先和发起人沟通。', button: '确认归还认领', icon: 'other' },
  complete: { title: '这份小美好，已经安排好了吗', description: '确认后将记录为你已安排。这是朋友之间的完成记录，不代表平台核验了消费、出票或预订。', button: '确认已安排好', icon: 'check' },
  close: { title: '要收起这份心愿吗', description: '关闭后，朋友不能再从本心愿认领、留言或付款。原报名和已有付款链接不受影响，也不会自动退款；已有心意记录仍会保留。', button: '确认关闭心愿', icon: 'other' },
};

function updateChrome() { setChrome(t(view.value === 'new' ? '写下小心愿' : '意思意思'), t('把小心意，变成小美好')); }
function login(redirect) { router.push({ path: '/m/login', query: { redirect: redirect || route.fullPath } }); }
function requireAuth(redirect) { if (store.token) return true; login(redirect); return false; }
function goCreate(kind = 'drink') { const target = `/m/wishes/new?kind=${encodeURIComponent(kind)}`; if (requireAuth(target)) router.push(target); }
function openWish(value) { router.push(`/m/wishes/${encodeURIComponent(value)}`); }
function changeTab(value) { if (listTab.value === value) return; listTab.value = value; items.value = []; hasMore.value = false; nextCursor.value = ''; moreLoading.value = false; if (store.token) loadList(); }
function money(value) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0'; }
function dateText(value, withTime = false) {
  if (!value) return '';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00+08:00` : value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language.value === 'en' ? 'en-GB' : 'zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(date);
}
function nameInitial(name) { return [...String(name || t('友'))][0] || t('友'); }
function stateLabel(item) {
  if (item.status === 'closed') return '已关闭';
  if (item.status === 'completed' || item.claimStatus === 'completed') return '已安排';
  if (item.order) return orderState(item.order);
  return item.claimStatus === 'claimed' ? '已有人认领' : '等待认领';
}
function orderState(order) {
  if (order.payStatus === 'refunded') return '已退款';
  if (order.cancelled) return '报名已取消';
  if (order.enrollmentStatus === 'waitlist') return '正在候补';
  if (order.enrollmentStatus === 'applied') return '等待抽签确认';
  if (order.payStatus === 'paid' || Number(order.remainAmount) === 0) return '团费已付清';
  return order.canPay ? (Number(order.paidAmount) > 0 ? '部分已付' : '待付款') : '当前无需付款';
}
const orderProgress = computed(() => {
  const order = wish.value?.order;
  if (!order) return 0;
  return Number(order.payAmount) > 0 ? Math.min(100, Math.max(0, Number(order.paidAmount || 0) / Number(order.payAmount) * 100)) : 0;
});
const arrangeTitle = computed(() => {
  const value = wish.value;
  if (value?.status === 'closed') return t('这份心愿，已经收好');
  if (value?.claimStatus === 'completed') return t('小美好，已经安排好');
  if (value?.isClaimant) return t('这份心愿，正在等你的安排');
  if (value?.claimStatus === 'claimed') return `${value.claimedByName || t('一位朋友')} ${t('正在安排')}`;
  return t(value?.isOwner ? '等一位朋友，接住你的小心愿' : '给 TA 一个小小的惊喜');
});
const arrangeDescription = computed(() => {
  if (wish.value?.status === 'closed') return t('谢谢每一份曾经接住它的心意。');
  if (wish.value?.claimStatus === 'completed') return t('由认领的朋友标记完成，记住这一刻的小欢喜。');
  if (wish.value?.isClaimant) return t('记得和发起人沟通，安排好后回来留个记录。');
  if (wish.value?.claimStatus === 'claimed') return t('有人接住了这份心愿，也可以送上一句祝福。');
  return t('认领后由你自行安排，一句祝福也同样珍贵。');
});
function errorText(error, fallback) { return t(error?.message || fallback); }
function idempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) return [...globalThis.crypto.getRandomValues(new Uint32Array(4))].map(value => value.toString(16)).join('-');
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
async function loadMeta() {
  const version = ++metaVersion;
  try {
    const response = await http.get('/wishes/meta');
    if (!active || version !== metaVersion) return;
    const rows = response.data?.categories;
    if (Array.isArray(rows)) categories.value = catalog.map(item => ({ ...item, ...(rows.find(row => row.key === item.key) || {}) }));
  } catch { /* Locally defined categories keep the inspiration gallery usable. */ }
}
async function loadList(append = false) {
  if (!store.token || (append && (listLoading.value || moreLoading.value || !hasMore.value))) return;
  const key = context(); const tab = listTab.value; const version = ++listVersion;
  if (append) moreLoading.value = true; else listLoading.value = true;
  listError.value = '';
  try {
    const response = await http.get('/me/wishes', { params: { tab, ...(append && nextCursor.value ? { cursor: nextCursor.value } : {}) } });
    if (!isCurrent(key) || version !== listVersion || listTab.value !== tab) return;
    const rows = Array.isArray(response.data?.items) ? response.data.items : [];
    items.value = append ? [...items.value, ...rows.filter(row => !items.value.some(item => item.token === row.token))] : rows;
    hasMore.value = !!response.data?.hasMore;
    nextCursor.value = response.data?.nextCursor || '';
  } catch (error) { if (isCurrent(key) && version === listVersion) listError.value = errorText(error, '暂时无法加载心意簿，请重试'); }
  finally { if (isCurrent(key) && version === listVersion) { listLoading.value = false; moreLoading.value = false; } }
}
async function loadDetail() {
  if (!token.value) return;
  const key = context(); const version = ++loadVersion;
  loading.value = true; detailError.value = '';
  try {
    const response = await http.get(`/wishes/${encodeURIComponent(token.value)}`);
    if (!isCurrent(key) || version !== loadVersion) return;
    wish.value = response.data;
  } catch (error) { if (isCurrent(key) && version === loadVersion) detailError.value = errorText(error, '暂时无法加载心愿，请重试'); }
  finally { if (isCurrent(key) && version === loadVersion) loading.value = false; }
}
async function loadOrders() {
  if (!store.token || view.value !== 'new') return;
  const key = context(); const version = ++ordersVersion;
  ordersLoading.value = true; ordersError.value = '';
  try {
    const response = await http.get('/me/wish-orders');
    if (!isCurrent(key) || version !== ordersVersion) return;
    orders.value = Array.isArray(response.data?.items) ? response.data.items : [];
    if (form.enrollmentId && !orders.value.some(item => String(orderId(item)) === String(form.enrollmentId))) form.enrollmentId = '';
  } catch (error) { if (isCurrent(key) && version === ordersVersion) ordersError.value = errorText(error, '暂时无法加载报名，请重试'); }
  finally { if (isCurrent(key) && version === ordersVersion) ordersLoading.value = false; }
}
function selectKind(kind) { form.kind = kind; formError.value = ''; if (kind !== 'trip') { linkOrder.value = false; form.enrollmentId = ''; } }
function chooseOrderMode() { linkOrder.value = true; if (!orders.value.length && !ordersLoading.value) loadOrders(); }
watch(orderRecipient, value => { if (value) form.recipientName = value; });
async function createWish() {
  if (busy.value || !requireAuth(route.fullPath)) return;
  formError.value = '';
  const title = form.title.trim();
  const recipientName = selectedOrder.value ? orderRecipient.value : form.recipientName.trim();
  if ([...recipientName].length > 20) { formError.value = t('收礼人昵称最多20字'); document.getElementById('wish-recipient')?.focus(); return; }
  if (!title || [...title].length > 40) { formError.value = t('请填写不超过40字的心愿'); document.getElementById('wish-title')?.focus(); return; }
  if ([...form.note.trim()].length > 240) { formError.value = t('想说的话最多240字'); return; }
  if (linkOrder.value && !selectedOrder.value) { formError.value = t('请先选择一份真实报名，或切换为旅行心愿'); return; }
  const body = { kind: form.kind, title, recipientName, note: form.note.trim(), ...(selectedOrder.value ? { enrollmentId: orderId(selectedOrder.value) } : {}) };
  const fingerprint = JSON.stringify(body);
  if (!createAttempt || createAttempt.fingerprint !== fingerprint) createAttempt = { fingerprint, key: idempotencyKey() };
  const key = context(); busy.value = true;
  try {
    const response = await http.post('/wishes', { ...body, idempotencyKey: createAttempt.key });
    if (!isCurrent(key)) return;
    if (!response.data?.token) throw new Error(t('心愿保存结果暂未确认，请重试'));
    openWish(response.data.token);
  } catch (error) { if (isCurrent(key)) formError.value = errorText(error, '心愿暂未保存成功，请重试'); }
  finally { if (isCurrent(key)) busy.value = false; }
}
async function ask(action) {
  if (actionsDisabled.value || !requireAuth(route.fullPath)) return;
  actionError.value = ''; notice.value = '';
  confirmation.value = { ...confirmations[action], action };
  actionSnapshot = { key: context(), token: token.value, revision: wish.value.revision };
  await nextTick();
  confirmDialog.value?.showModal();
}
function cancelConfirm() { if (busy.value) return; confirmDialog.value?.close(); confirmation.value = null; actionSnapshot = null; actionError.value = ''; }
function onDialogClick(event) { if (event.target === confirmDialog.value) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cancelConfirm(); } }
async function conflict(error) {
  if (error.status !== 409) return false;
  notice.value = t('这份心愿刚有了新进展，已为你刷新，请确认后再操作。');
  confirmDialog.value?.close(); confirmation.value = null; actionSnapshot = null;
  await loadDetail();
  return true;
}
async function confirmAction() {
  if (busy.value || loading.value || !confirmation.value || !actionSnapshot || !isCurrent(actionSnapshot.key)) return;
  const { action } = confirmation.value; const snapshot = { ...actionSnapshot };
  busy.value = true; actionError.value = '';
  try {
    const path = `/wishes/${encodeURIComponent(snapshot.token)}/${action === 'release' ? 'claim' : action}`;
    const response = action === 'release' ? await http.delete(path, { data: { revision: snapshot.revision } }) : await http.post(path, { revision: snapshot.revision });
    if (!isCurrent(snapshot.key)) return;
    wish.value = response.data;
    confirmDialog.value?.close(); confirmation.value = null; actionSnapshot = null;
    notice.value = t({ claim: '这份心愿，交给你啦。记得和发起人沟通安排。', release: '已归还认领，谢谢你认真回应这份心意。', complete: '已记下这份小美好，谢谢你的安排。', close: '心愿已关闭，原行程订单不受影响。' }[action]);
  } catch (error) { if (isCurrent(snapshot.key) && !await conflict(error)) actionError.value = errorText(error, '暂时未能完成操作，请重试'); }
  finally { if (isCurrent(snapshot.key)) busy.value = false; }
}
async function goPay() {
  if (actionsDisabled.value || !requireAuth(route.fullPath)) return;
  const key = context(); busy.value = true; actionError.value = '';
  try {
    const response = await http.get(`/wishes/${encodeURIComponent(token.value)}/payment`);
    if (!isCurrent(key)) return;
    if (!response.data?.token) throw new Error(t('暂时无法打开关联订单，请刷新后重试'));
    router.push({ path: `/m/pay/${encodeURIComponent(response.data.token)}`, query: { mode: 'split' } });
  } catch (error) { if (isCurrent(key) && !await conflict(error)) { actionError.value = errorText(error, '暂时无法打开关联订单，请重试'); await loadDetail(); } }
  finally { if (isCurrent(key)) busy.value = false; }
}
async function sendBlessing() {
  if (actionsDisabled.value || !requireAuth(route.fullPath)) return;
  const message = blessingMessage.value.trim();
  if (!message || [...message].length > 80) return;
  const key = context(); const fingerprint = `${key}\n${message}`;
  if (!blessingAttempt || blessingAttempt.fingerprint !== fingerprint) blessingAttempt = { fingerprint, key: idempotencyKey() };
  busy.value = true; actionError.value = ''; notice.value = '';
  try {
    const response = await http.post(`/wishes/${encodeURIComponent(token.value)}/bless`, { message, idempotencyKey: blessingAttempt.key });
    if (!isCurrent(key)) return;
    wish.value = response.data; blessingMessage.value = ''; blessingAttempt = null;
    notice.value = t('心意已送达，愿今天多一点美好。');
  } catch (error) { if (isCurrent(key) && !await conflict(error)) actionError.value = errorText(error, '祝福暂未送达，请重试'); }
  finally { if (isCurrent(key)) busy.value = false; }
}
async function shareWish() {
  if (sharing.value || actionsDisabled.value || !wish.value) return;
  const key = context(); const url = `${window.location.origin}/m/wishes/${encodeURIComponent(token.value)}`;
  sharing.value = true; actionError.value = ''; shareFallback.value = '';
  try {
    if (nativeShareSupported(navigator)) await navigator.share({ title: wish.value.title, text: t('一份小心愿，想和你分享。'), url });
    else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); if (isCurrent(key)) notice.value = t('心愿链接已复制，发给熟悉的朋友吧。'); }
    else shareFallback.value = url;
  } catch (error) { if (isCurrent(key) && error?.name !== 'AbortError') shareFallback.value = url; }
  finally { if (isCurrent(key)) sharing.value = false; }
}
watch(() => [route.fullPath, store.token], () => {
  loadVersion++; listVersion++; ordersVersion++;
  wish.value = null; detailError.value = ''; actionError.value = ''; notice.value = ''; shareFallback.value = '';
  busy.value = false; sharing.value = false; loading.value = false; items.value = []; listLoading.value = false; listError.value = ''; moreLoading.value = false; hasMore.value = false; nextCursor.value = '';
  confirmDialog.value?.close(); confirmation.value = null; actionSnapshot = null;
  blessingMessage.value = ''; blessingAttempt = null; createAttempt = null;
  orders.value = []; ordersError.value = ''; ordersLoading.value = false;
  updateChrome();
  if (view.value === 'detail') loadDetail();
  else if (view.value === 'hub') { loadMeta(); if (store.token) loadList(); }
  else {
    const kind = catalog.some(item => item.key === route.query.kind) ? String(route.query.kind) : 'drink';
    Object.assign(form, { kind, title: '', recipientName: '', note: '', enrollmentId: kind === 'trip' ? String(route.query.enrollmentId || '') : '' });
    formError.value = ''; linkOrder.value = !!form.enrollmentId;
    if (!requireAuth(route.fullPath)) return;
    loadMeta(); if (linkOrder.value) loadOrders();
  }
}, { immediate: true });
onBeforeUnmount(() => { active = false; loadVersion++; listVersion++; ordersVersion++; metaVersion++; confirmDialog.value?.close(); window.removeEventListener('bj-look', onLook); });
</script>

<style scoped>
.wishes-page{--wish-ink:#292530;--wish-muted:#82798e;--wish-purple:#5b3b8c;--wish-soft:#f2edf8;--wish-line:#ede8f2;--wish-white:#fff;max-width:760px;margin:0 auto;padding:12px 18px 38px;color:var(--wish-ink);font-size:calc(14px * var(--ui-scale,1));line-height:1.55;overflow-wrap:anywhere}.wishes-page *{box-sizing:border-box}.wishes-page button,.wishes-page input,.wishes-page select,.wishes-page textarea{font:inherit}.wishes-page button{cursor:pointer;touch-action:manipulation}.wishes-page button:disabled{opacity:.48;cursor:default}.wishes-page button:focus-visible,.wishes-page input:focus-visible,.wishes-page select:focus-visible,.wishes-page textarea:focus-visible{outline:3px solid #b4a0d4;outline-offset:3px}.wishes-page h1,.wishes-page h2,.wishes-page h3,.wishes-page p{margin:0}.wishes-page button{border:0}.wish-primary{width:100%;display:flex;align-items:center;justify-content:center;gap:12px;min-height:50px;padding:12px 18px;border-radius:16px;background:var(--wish-purple);color:#fff;font-weight:600;line-height:1.4}.wish-primary .wish-glyph{width:25px;height:25px;flex:none}.wish-secondary{border:1px solid var(--wish-line)!important;background:var(--wish-white);color:var(--wish-purple);padding:10px 20px;border-radius:12px;font-weight:600}.wish-text-button{padding:9px 0;background:none;color:var(--wish-muted);font-size:.88em;line-height:1.5}.wish-eyebrow{font-size:.76em;letter-spacing:.12em;color:var(--wish-muted)}.wish-hero{display:flex;position:relative;align-items:center;min-height:247px;padding:28px 20px 30px;border-radius:26px;background:#f1ebf8;isolation:isolate;overflow:hidden}.wish-hero-copy{position:relative;z-index:1;flex:1;min-width:0}.wish-hero h1{font-size:2.7em;letter-spacing:.04em;line-height:1.2;margin:8px 0 10px;font-weight:750;color:var(--wish-purple)}.wish-title-dot{color:#c2abde}.wish-hero p{font-size:1.02em;color:#70607d;margin-bottom:22px}.wish-hero .wish-primary{width:fit-content;min-height:43px;padding:11px 15px;border-radius:13px;font-size:.9em;max-width:100%}.wish-hero-art{width:105px;height:180px;position:relative;flex:none;color:var(--wish-purple);margin-left:4px}.wish-art-ticket{position:absolute;inset:36px 2px 13px 6px;transform:rotate(12deg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#fffdfb;box-shadow:6px 8px 0 #ded3ee;border:1px solid #e1d6ee;border-radius:13px}.wish-art-ticket .wish-glyph{width:45px;height:45px}.wish-art-ticket i{width:66%;border-bottom:1px dashed #d8cae9}.wish-art-ticket b{font-size:8px;letter-spacing:3px;font-weight:500;color:#a18bb6}.wish-art-heart{position:absolute;bottom:0;left:-3px;width:35px;height:35px;background:#a18abf;border-radius:50%;color:white;padding:9px;transform:rotate(-12deg)}.wish-art-label{position:absolute;top:7px;right:-2px;font-size:9px;letter-spacing:3px;transform:rotate(8deg);color:#9c86b3}.wish-art-star{position:absolute;top:14px;left:4px;color:#bba6d4;font-size:28px}.wish-art-orbit{position:absolute;border:1px solid #e4d9ef;width:172px;height:172px;border-radius:50%;left:-32px;top:20px;z-index:-1}.wish-ideas,.wish-mine{margin-top:30px}.wish-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}.wish-section-heading h2{font-size:1.15em;font-weight:650;line-height:1.45}.wish-section-heading>span{font-size:.76em;color:var(--wish-muted)}.wish-category-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.wish-category{min-width:0;min-height:119px;border-radius:17px;background:var(--wish-white);padding:14px 5px 12px;text-align:center;color:var(--wish-ink);display:flex;align-items:center;flex-direction:column}.wish-category-icon{width:36px;height:36px;color:var(--wish-purple);margin-bottom:10px}.wish-category strong{font-size:.86em;font-weight:600;line-height:1.4}.wish-category small{font-size:.64em;color:var(--wish-muted);margin-top:4px}.wish-trip-entry{width:100%;display:flex;align-items:center;gap:13px;padding:17px 15px;margin-top:12px;border:1px solid #e9e0f2!important;background:#faf7fd;border-radius:18px;text-align:left;color:var(--wish-purple)}.wish-trip-entry>span:nth-child(2){flex:1;min-width:0}.wish-trip-entry strong{display:block;font-size:.96em;font-weight:600}.wish-trip-entry small{display:block;font-size:.74em;color:var(--wish-muted);margin-top:4px}.wish-trip-mark{width:38px;height:38px;flex:none}.wish-trip-entry>.wish-glyph{width:25px;height:25px;flex:none}.wish-list-tabs{display:flex;gap:24px;border-bottom:1px solid var(--wish-line);margin-bottom:15px}.wish-list-tab{position:relative;padding:8px 1px 14px;background:none;color:var(--wish-muted);font-weight:500}.wish-list-tab.on{color:var(--wish-purple);font-weight:650}.wish-list-tab.on:after{position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);content:'';width:24px;height:3px;background:var(--wish-purple);border-radius:8px}.wish-empty{text-align:center;background:var(--wish-white);padding:28px 20px;border-radius:22px}.wish-empty-glyph{display:block;width:42px;height:42px;margin:0 auto 13px;color:#a792be}.wish-empty h3,.wish-empty h1{font-size:1.04em;font-weight:600}.wish-empty p{font-size:.84em;color:var(--wish-muted);max-width:280px;margin:8px auto 18px}.wish-empty .wish-text-button{display:block;margin:8px auto 0}.wish-list{display:grid;gap:12px}.wish-load-more{display:block;margin:17px auto 0;padding:10px 18px;border-radius:10px;background:var(--wish-white);color:var(--wish-purple);font-size:.84em!important}.wish-bless-help{color:var(--wish-muted);font-size:.72em!important;line-height:1.7;margin-top:9px!important}.wish-list-card{display:flex;width:100%;align-items:center;text-align:left;gap:12px;padding:17px 14px;background:var(--wish-white);border-radius:18px;color:var(--wish-ink);min-width:0}.wish-list-icon{width:45px;height:50px;flex:none;background:var(--wish-soft);color:var(--wish-purple);padding:9px;border-radius:12px}.wish-list-copy{flex:1;min-width:0}.wish-list-copy>strong{display:block;font-size:1em;font-weight:600;line-height:1.5;margin:4px 0}.wish-list-copy>span:last-child{font-size:.76em;color:var(--wish-muted)}.wish-list-top{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.wish-list-top small{color:var(--wish-muted);font-size:.72em}.wish-list-top em{color:var(--wish-purple);font-size:.7em;font-style:normal}.wish-list-top em.finished{color:var(--wish-muted)}.wish-list-arrow{font-size:1.4em;color:#b4a8c0}.wish-page-note{font-size:.73em!important;line-height:1.7;color:var(--wish-muted);text-align:center;margin:20px 4px 0!important}.wish-loading{text-align:center;color:var(--wish-muted);padding:32px 15px;font-size:.9em}.wish-error{padding:15px;border:1px solid var(--wish-line);border-radius:15px;background:var(--wish-white);font-size:.86em;color:var(--wish-muted)}.wish-retry{padding:7px 0;background:none;color:var(--wish-purple);font-weight:600;text-decoration:underline;text-underline-offset:3px}.wish-feedback{color:var(--wish-purple);font-size:.85em;line-height:1.7;background:var(--wish-soft);padding:11px 14px;border-radius:12px;margin:14px 0!important}.wish-feedback.error{color:#a43c46;background:#fff0f1}.wish-form-heading{padding:15px 4px 25px}.wish-form-heading h1{font-size:1.6em;font-weight:650;margin:8px 0 10px;line-height:1.45}.wish-form-heading p{font-size:.87em;color:var(--wish-muted)}.wish-form{background:var(--wish-white);padding:21px 17px;border-radius:24px}.wish-kind-field{padding:0 0 24px;margin:0;border:0;min-width:0}.wish-kind-field legend,.wish-order-choice h2{font-size:1em;font-weight:600;margin-bottom:14px}.wish-kind-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.wish-kind-options button{display:flex;align-items:center;flex-direction:column;justify-content:center;gap:7px;min-height:77px;padding:10px 2px;background:#faf9fc;color:var(--wish-muted);border:1px solid transparent;border-radius:12px;font-size:.72em}.wish-kind-options button .wish-glyph{width:27px;height:27px}.wish-kind-options button.on{border-color:#d7c7e8;background:var(--wish-soft);color:var(--wish-purple)}.wish-field{display:block;margin:22px 0 0}.wish-field>span:first-child{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:.92em;font-weight:600;margin-bottom:9px;flex-wrap:wrap}.wish-field>span small{font-size:.78em;color:var(--wish-muted);font-weight:400}.wish-field input,.wish-field select,.wish-field textarea{display:block;width:100%;min-width:0;background:#faf9fc;color:var(--wish-ink);border:1px solid var(--wish-line);border-radius:12px;padding:13px 12px;line-height:1.6;font-size:.91em;resize:vertical}.wish-field input:read-only{color:var(--wish-muted)}.wish-field input::placeholder,.wish-field textarea::placeholder{color:#a198aa}.wish-field select{padding-right:30px}.wish-field-help{display:block;font-size:.76em;color:var(--wish-muted);line-height:1.75;margin:9px 0 0!important}.wish-order-choice{padding:18px 0;border-top:1px solid var(--wish-line);border-bottom:1px solid var(--wish-line)}.wish-order-modes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wish-order-modes button{border:1px solid var(--wish-line);color:var(--wish-muted);background:#faf9fc;padding:12px 8px;border-radius:13px;font-size:.83em;line-height:1.6}.wish-order-modes button.on{border-color:#bfa7d8;background:var(--wish-soft);color:var(--wish-purple)}.wish-order-modes small{display:block;font-size:.78em;opacity:.8;margin-top:3px}.wish-selected-order{display:flex;align-items:center;gap:10px;background:var(--wish-soft);border-radius:13px;padding:12px;margin-top:13px}.wish-selected-order>.wish-glyph{width:28px;height:28px;flex:none;color:var(--wish-purple)}.wish-selected-order>span{min-width:0;flex:1}.wish-selected-order strong{font-size:.86em;font-weight:600;display:block}.wish-selected-order small{font-size:.72em;color:var(--wish-muted);display:block;margin-top:4px}.wish-selected-order>b{font-size:.98em;color:var(--wish-purple);font-weight:600;text-align:right}.wish-form-summary{margin:24px 0 18px;display:flex;align-items:flex-start;gap:9px;font-size:.8em;color:var(--wish-muted)}.wish-form-summary>.wish-glyph{width:21px;height:21px;flex:none;color:#a58abb}.wish-form .wish-page-note{font-size:.67em!important}.wish-detail-topline{display:flex;align-items:center;justify-content:space-between;gap:15px;margin:0 3px 12px}.wish-detail-topline>button:first-child{color:var(--wish-purple)}.wish-detail-topline>button:first-child span{color:#c4b5d3;margin:0 7px}.wish-detail-topline .wish-close{font-size:.76em}.wish-paper{position:relative;padding:24px 22px 21px;border-radius:23px;background:#fffdfa;box-shadow:0 8px 24px #49326206;overflow:hidden;border:1px solid #f0e9e0}.wish-paper:before{content:'';position:absolute;top:0;left:22px;width:calc(100% - 44px);height:3px;border-radius:0 0 5px 5px;background:#b29acb}.wish-paper-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:25px}.wish-paper-category{display:flex;align-items:center;gap:9px;color:var(--wish-purple);font-size:.84em}.wish-paper-category>.wish-glyph{width:25px;height:25px}.wish-status{font-size:.72em;background:#f0e9f6;color:var(--wish-purple);border-radius:30px;padding:5px 10px;white-space:normal;text-align:center}.wish-status.finished{background:#f0edf0;color:var(--wish-muted)}.wish-paper-to{font-size:.75em;letter-spacing:.07em;color:#9683a6}.wish-paper h1{font-size:1.8em;font-weight:650;line-height:1.5;margin:12px 0 15px;letter-spacing:.015em}.wish-personal-note{font-size:.93em;line-height:1.9;color:#7d707e;white-space:pre-wrap}.wish-paper-footer{display:flex;align-items:center;gap:10px;margin-top:26px;border-top:1px dashed #e4dbe8;padding-top:17px}.wish-owner-monogram{display:flex;align-items:center;justify-content:center;width:33px;height:33px;background:#f1e9f7;color:var(--wish-purple);border-radius:50%;font-size:.9em;flex:none}.wish-paper-footer>span:nth-child(2){min-width:0;flex:1}.wish-paper-footer strong{display:block;font-size:.78em;font-weight:500}.wish-paper-footer small{display:block;font-size:.66em;color:var(--wish-muted);margin-top:3px}.wish-paper-stamp{border:1px solid #ded1e8;color:#b59ec9;padding:6px;border-radius:50%;width:32px;height:32px;transform:rotate(-15deg);flex:none}.wish-order-panel,.wish-arrange-panel,.wish-blessings{margin-top:18px;background:var(--wish-white);border-radius:22px;padding:21px 19px}.wish-order-panel .wish-section-heading{gap:8px}.wish-order-panel h2{font-size:1em}.wish-order-state{font-size:.7em!important}.wish-real-order{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--wish-line);padding:2px 0 17px}.wish-order-mark{background:var(--wish-soft);color:var(--wish-purple);padding:9px;width:43px;height:43px;border-radius:13px;flex:none}.wish-real-order strong{font-size:.96em;font-weight:600}.wish-real-order p{font-size:.75em;color:var(--wish-muted);margin-top:5px}.wish-order-amount{display:flex;align-items:end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:19px 0 13px}.wish-order-amount>div>small{display:block;font-size:.73em;color:var(--wish-muted)}.wish-order-amount strong{display:block;line-height:1.2;font-size:2.2em;font-weight:650;letter-spacing:-.04em;margin-top:6px}.wish-order-amount strong span{font-size:.5em;letter-spacing:0;margin-right:3px}.wish-order-amount>p{font-size:.75em;color:var(--wish-muted);text-align:right}.wish-order-amount>p>span{display:block;margin-top:5px}.wish-progress{height:5px;overflow:hidden;border-radius:10px;background:var(--wish-soft);margin:15px 0 22px}.wish-progress i{display:block;background:#9d82bd;height:100%;border-radius:inherit}.wish-arrange-panel{display:grid;grid-template-columns:35px minmax(0,1fr);gap:0 11px}.wish-arrange-icon{width:35px;height:35px;padding:7px;border-radius:50%;background:var(--wish-soft);color:var(--wish-purple);margin-top:4px}.wish-arrange-panel .wish-eyebrow{font-size:.67em;letter-spacing:.05em}.wish-arrange-panel h2{font-size:1.12em;font-weight:600;margin:5px 0 7px;line-height:1.55}.wish-arrange-panel p{font-size:.79em;color:var(--wish-muted);line-height:1.8}.wish-arrange-panel>.wish-primary,.wish-arrange-actions{grid-column:1/-1;margin-top:20px}.wish-arrange-actions .wish-text-button{display:block;margin:9px auto 0;text-align:center;font-size:.76em}.wish-ended-note{display:flex;align-items:center;gap:10px;color:var(--wish-muted);font-size:.8em;padding:18px 5px 0}.wish-ended-note>.wish-glyph{width:23px;height:23px;flex:none}.wish-share{display:flex;justify-content:center;align-items:center;gap:16px;width:100%;padding:15px 12px;color:var(--wish-purple);background:none;font-size:.87em}.wish-share>span:last-child{font-size:1.3em}.wish-share-fallback{padding:14px;background:var(--wish-white);border-radius:14px;font-size:.8em}.wish-share-fallback input{display:block;width:100%;padding:10px;border:1px solid var(--wish-line);background:#faf9fc;color:var(--wish-ink);margin-top:9px;border-radius:8px}.wish-blessings{margin-top:4px}.wish-blessings .wish-section-heading{margin-bottom:16px}.wish-blessings h2 small{font-size:.7em;color:#aa94bf;margin-left:8px;font-weight:400}.wish-blessing-form{border:1px solid var(--wish-line);background:#faf9fc;border-radius:15px;padding:12px 13px}.wish-blessing-form textarea{display:block;width:100%;border:0;resize:vertical;background:none;color:var(--wish-ink);font-size:.86em;line-height:1.7;min-height:58px}.wish-blessing-form textarea::placeholder{color:#a095aa}.wish-blessing-form>div{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}.wish-blessing-form>div>span{font-size:.7em;color:#a095aa}.wish-bless-submit{background:var(--wish-soft);color:var(--wish-purple);font-weight:600;border-radius:9px;font-size:.79em!important;padding:7px 12px;display:flex;gap:10px}.wish-bless-login{display:flex;align-items:center;justify-content:space-between;gap:15px;background:var(--wish-soft);color:var(--wish-purple);padding:14px;width:100%;border-radius:12px;font-size:.85em!important;text-align:left}.wish-blessing{display:flex;align-items:flex-start;gap:11px;padding:18px 0;border-bottom:1px solid var(--wish-line)}.wish-blessing:last-child{border-bottom:0;padding-bottom:0}.wish-blessing-avatar{width:31px;height:31px;display:flex;align-items:center;justify-content:center;background:var(--wish-soft);color:#9680ad;border-radius:50%;font-size:.8em;flex:none}.wish-blessing>div{flex:1;min-width:0}.wish-blessing header{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.wish-blessing strong{font-size:.78em;font-weight:500;color:var(--wish-muted)}.wish-blessing time{font-size:.67em;color:#b0a6b9}.wish-blessing p{font-size:.88em;line-height:1.8;white-space:pre-wrap;margin-top:6px}.wish-no-blessings{font-size:.8em;color:#a294ae;text-align:center;padding:24px 0 8px}.wish-detail-refresh{margin-top:15px}.wish-detail-loading{padding:100px 18px}.wish-unavailable{margin-top:40px}.wish-confirm{border:0;border-radius:25px;width:calc(100% - 36px);max-width:390px;padding:26px 23px 15px;background:var(--wish-white);color:var(--wish-ink);box-shadow:0 12px 70px #28203533;max-height:calc(100dvh - 40px);overflow:auto}.wish-confirm::backdrop{background:#26203366;backdrop-filter:blur(3px)}.wish-confirm-content{text-align:center}.wish-confirm-icon{display:block;margin:0 auto 14px;color:var(--wish-purple);width:47px;height:47px;padding:10px;background:var(--wish-soft);border-radius:15px}.wish-confirm .wish-eyebrow{font-size:.66em;letter-spacing:.04em}.wish-confirm h2{font-size:1.3em;line-height:1.55;margin:9px 0 12px;font-weight:600}.wish-confirm-content>p{font-size:.87em;line-height:1.9;color:var(--wish-muted);text-align:left}.wish-confirm .wish-primary{margin-top:24px;min-height:46px}.wish-confirm .wish-text-button{margin:5px 0 0;padding:11px;width:100%;font-size:.84em}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(min-width:600px){.wishes-page{padding:24px 26px 55px}.wish-hero{padding:38px 35px;min-height:276px}.wish-hero-art{width:160px;transform:scale(1.1);margin-right:25px}.wish-art-ticket{inset:30px 15px 13px 24px}.wish-art-label{right:22px}.wish-art-heart{left:15px}.wish-art-orbit{left:0}.wish-hero h1{font-size:3.1em}.wish-category-grid{gap:14px}.wish-category{min-height:135px}.wish-category-icon{width:42px;height:42px}.wish-category strong{font-size:.98em}.wish-category small{font-size:.75em}.wish-form{padding:28px}.wish-paper{padding:30px}.wish-paper h1{font-size:2.1em}.wish-order-panel,.wish-arrange-panel,.wish-blessings{padding:25px}.wish-list{grid-template-columns:repeat(2,minmax(0,1fr))}.wish-list-card{gap:9px}.wish-list-icon{width:38px;height:43px;padding:8px}}
@media(max-width:350px){.wishes-page{padding-left:12px;padding-right:12px}.wish-hero{padding:24px 15px}.wish-hero-art{width:76px;transform:scale(.88);transform-origin:right center}.wish-art-ticket{left:-5px;right:-2px}.wish-hero h1{font-size:2.3em}.wish-hero .wish-eyebrow{font-size:.68em;letter-spacing:.04em}.wish-hero p{font-size:.86em}.wish-hero .wish-primary{font-size:.79em;gap:5px;padding:10px}.wish-primary .wish-glyph{width:21px;height:21px}.wish-category-grid{gap:7px}.wish-category small{font-size:.59em}.wish-form{padding:18px 13px}.wish-kind-options{grid-template-columns:repeat(3,minmax(0,1fr))}.wish-order-modes{grid-template-columns:1fr}.wish-paper{padding:23px 17px}.wish-paper h1{font-size:1.6em}.wish-order-panel,.wish-arrange-panel,.wish-blessings{padding:18px 15px}}
:global(html[data-night="dark"] .mp-phone.is-wishes .wishes-page strong){background:transparent;color:inherit}
:global(html[data-night="dark"] .mp-phone.is-wishes .mp-status),:global(html[data-night="dark"] .mp-phone.is-wishes .mp-nav){background:#241f2b;color:#f0eaf5}
:global(html[data-night="dark"] .mp-phone.is-wishes .brand-name){color:#f0eaf5}
:global(html[data-night="dark"] .mp-phone.is-wishes .icp-foot){background:#241f2b;color:#baacc8}
:global(html[data-night="dark"] .wishes-page){--wish-ink:#f0eaf5;--wish-muted:#baacc8;--wish-purple:#c7ace9;--wish-soft:#352d42;--wish-line:#43384e;--wish-white:#29242f}
:global(html[data-night="dark"] .wish-hero){background:#342b43}
:global(html[data-night="dark"] .wish-hero p){color:#c5b8d2}
:global(html[data-night="dark"] .wish-primary){background:#8d66bb;color:#fff}
:global(html[data-night="dark"] .wish-art-ticket){background:#eae0f3;border-color:#bca7d0;color:#72518f;box-shadow:6px 8px 0 #574266}
:global(html[data-night="dark"] .wish-art-orbit){border-color:#54415f}
:global(html[data-night="dark"] .wish-trip-entry){background:#302838;border-color:#46374f!important}
:global(html[data-night="dark"] .wish-kind-options button),:global(html[data-night="dark"] .wish-order-modes button),:global(html[data-night="dark"] .wish-field input),:global(html[data-night="dark"] .wish-field select),:global(html[data-night="dark"] .wish-field textarea),:global(html[data-night="dark"] .wish-blessing-form),:global(html[data-night="dark"] .wish-share-fallback input){background:#241f2a}
:global(html[data-night="dark"] .wish-kind-options button.on),:global(html[data-night="dark"] .wish-order-modes button.on){background:#3e2f4d;border-color:#8869a4}
:global(html[data-night="dark"] .wish-paper){background:#2c2531;border-color:#493c4e}
:global(html[data-night="dark"] .wish-paper-to),:global(html[data-night="dark"] .wish-personal-note){color:#c0adc8}
:global(html[data-night="dark"] .wish-paper-footer){border-color:#54415c}
:global(html[data-night="dark"] .wish-owner-monogram),:global(html[data-night="dark"] .wish-status){background:#493655}
:global(html[data-night="dark"] .wish-status.finished){background:#39313f}
:global(html[data-night="dark"] .wish-feedback.error){background:#462b35;color:#ffc1ca}
@media(prefers-reduced-motion:no-preference){.wish-primary,.wish-category,.wish-list-card,.wish-kind-options button{transition:background .16s ease,transform .16s ease}.wish-category:active,.wish-list-card:active{transform:scale(.98)}}
</style>
