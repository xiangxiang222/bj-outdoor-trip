import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from '@/api/http';
import Wishes from './Wishes.vue';

const fixture = vi.hoisted(() => ({
  route: { path: '/m/wishes/token-one', fullPath: '/m/wishes/token-one', name: 'wish-detail', params: { token: 'token-one' }, query: {} },
  store: { token: 'owner-auth' },
  router: { push: vi.fn() },
}));
vi.mock('vue', async importOriginal => {
  const vue = await importOriginal();
  return { ...vue, watch: vi.fn(), onBeforeUnmount: vi.fn(), useSSRContext: () => ({ modules: new Set() }) };
});
vi.mock('vue-router', () => ({ useRoute: () => fixture.route, useRouter: () => fixture.router }));
vi.mock('@/stores/user', () => ({ useUserStore: () => fixture.store }));
vi.mock('@/api/http', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/utils/appearance', () => ({ readLook: () => ({ lang: 'zh' }) }));
vi.mock('@/utils/pageChrome', () => ({ setChrome: vi.fn() }));
vi.mock('@/utils/share', () => ({ nativeShareSupported: () => false }));

const setupPage = () => Wishes.setup({}, { expose: vi.fn() });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const wish = (extra = {}) => ({ token: 'token-one', kind: 'drink', title: '喝杯喜欢的', recipientName: '小林', status: 'open', revision: 3, blessings: [], ...extra });

describe('wish creation and real enrollment payments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), location: { origin: 'https://example.test' } });
    vi.stubGlobal('document', { getElementById: () => null });
    Object.assign(fixture.route, { path: '/m/wishes/token-one', fullPath: '/m/wishes/token-one', name: 'wish-detail', params: { token: 'token-one' }, query: {} });
    fixture.store.token = 'owner-auth';
  });

  it('preserves the selected wish category through guest login', () => {
    fixture.store.token = '';
    const state = setupPage();
    state.goCreate('transport');
    expect(fixture.router.push).toHaveBeenCalledWith({ path: '/m/login', query: { redirect: '/m/wishes/new?kind=transport' } });
    expect(http.post).not.toHaveBeenCalled();
  });

  it('requires an explicit wish while allowing an omitted nickname for oneself', async () => {
    const state = setupPage();
    await state.createWish();
    expect(state.formError.value).toMatch(/心愿/);
    expect(http.post).not.toHaveBeenCalled();
    state.form.title = '自己的一杯咖啡';
    http.post.mockResolvedValueOnce({ data: wish({ token: 'created-self' }) });
    await state.createWish();
    expect(http.post.mock.calls[0][1].recipientName).toBe('');
    expect(fixture.router.push).toHaveBeenCalledWith('/m/wishes/created-self');
  });

  it('takes the linked enrollment identity from the masked traveler and has no arbitrary amount', async () => {
    const state = setupPage();
    Object.assign(state.form, { kind: 'trip', title: '一起去山里', recipientName: '不能覆盖真实出行人', note: '周末见', enrollmentId: '31' });
    state.linkOrder.value = true;
    state.orders.value = [{ enrollmentId: 31, title: '周末一日', recipientName: '林*', remainAmount: 138 }];
    http.post.mockResolvedValueOnce({ data: wish({ token: 'created-trip' }) });
    await state.createWish();
    const [url, body] = http.post.mock.calls[0];
    expect(url).toBe('/wishes');
    expect(body).toMatchObject({ kind: 'trip', title: '一起去山里', recipientName: '林*', note: '周末见', enrollmentId: 31 });
    expect(Object.keys(body).sort()).toEqual(['enrollmentId', 'idempotencyKey', 'kind', 'note', 'recipientName', 'title']);
    expect(fixture.router.push).toHaveBeenCalledWith('/m/wishes/created-trip');
  });

  it('blocks a missing linked enrollment instead of silently creating a payment wish', async () => {
    const state = setupPage();
    Object.assign(state.form, { kind: 'trip', title: '下一程', recipientName: '自己', enrollmentId: '31' });
    state.linkOrder.value = true;
    await state.createWish();
    expect(state.formError.value).toMatch(/真实报名/);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('reuses a creation key after an uncertain network failure but changes it for edited content', async () => {
    const state = setupPage();
    Object.assign(state.form, { kind: 'drink', title: '一杯奶茶', recipientName: '自己' });
    http.post.mockRejectedValueOnce(new Error('网络中断')).mockRejectedValueOnce(new Error('网络中断')).mockResolvedValueOnce({ data: wish({ token: 'created-new' }) });
    await state.createWish();
    await state.createWish();
    state.form.title = '一杯咖啡';
    await state.createWish();
    const bodies = http.post.mock.calls.map(([, body]) => body);
    expect(bodies[0].idempotencyKey).toBe(bodies[1].idempotencyKey);
    expect(bodies[2].idempotencyKey).not.toBe(bodies[1].idempotencyKey);
    expect(state.busy.value).toBe(false);
  });

  it('opens only the backend-provided original order payment token, using split mode', async () => {
    const state = setupPage();
    state.wish.value = wish({ kind: 'trip', canPay: true });
    http.get.mockResolvedValueOnce({ data: { token: 'original-payment-token', mode: 'split' } });
    await state.goPay();
    expect(http.get).toHaveBeenCalledWith('/wishes/token-one/payment');
    expect(fixture.router.push).toHaveBeenCalledWith({ path: '/m/pay/original-payment-token', query: { mode: 'split' } });
    expect(http.post).not.toHaveBeenCalled();
  });

  it('does not navigate to payment after the account changes while resolving the link', async () => {
    const state = setupPage();
    const pending = deferred();
    http.get.mockReturnValueOnce(pending.promise);
    const running = state.goPay();
    fixture.store.token = 'different-account';
    pending.resolve({ data: { token: 'old-account-payment' } });
    await running;
    expect(fixture.router.push).not.toHaveBeenCalled();
  });

  it('keeps paid order status separate from arranging or completing the wish', () => {
    const state = setupPage();
    const paid = wish({ kind: 'trip', order: { payStatus: 'paid', remainAmount: 0 } });
    expect(state.stateLabel(paid)).toBe('团费已付清');
    expect(paid.status).toBe('open');
    expect(paid.claimStatus).toBeUndefined();
  });

  it('uses a JSON body for returning a claim and prevents duplicate submissions', async () => {
    const state = setupPage();
    state.wish.value = wish({ isClaimant: true, canRelease: true });
    await state.ask('release');
    const pending = deferred();
    http.delete.mockReturnValueOnce(pending.promise);
    const running = state.confirmAction();
    await state.confirmAction();
    expect(http.delete).toHaveBeenCalledTimes(1);
    expect(http.delete).toHaveBeenCalledWith('/wishes/token-one/claim', { data: { revision: 3 } });
    pending.resolve({ data: wish({ revision: 4 }) });
    await running;
    expect(state.wish.value.revision).toBe(4);
    expect(state.confirmation.value).toBe(null);
  });

  it('refreshes a version conflict without automatically replaying the operation', async () => {
    const state = setupPage();
    state.wish.value = wish({ canClaim: true });
    await state.ask('claim');
    http.post.mockRejectedValueOnce(Object.assign(new Error('心愿状态已变化'), { status: 409 }));
    http.get.mockResolvedValueOnce({ data: wish({ revision: 4, claimedByName: '另一位朋友', canClaim: false }) });
    await state.confirmAction();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith('/wishes/token-one');
    expect(state.wish.value.revision).toBe(4);
    expect(state.confirmation.value).toBe(null);
    expect(state.notice.value).toMatch(/请确认后再操作/);
    expect(state.busy.value).toBe(false);
  });

  it('does not replace a new detail page with the previous token response', async () => {
    const state = setupPage();
    const pending = deferred();
    http.get.mockReturnValueOnce(pending.promise);
    const running = state.loadDetail();
    fixture.route.fullPath = '/m/wishes/token-two';
    fixture.route.params.token = 'token-two';
    pending.resolve({ data: wish() });
    await running;
    expect(state.wish.value).toBe(null);
  });

  it('retries an uncertain blessing with the same message and idempotency key', async () => {
    const state = setupPage();
    state.wish.value = wish({ canBless: true });
    state.blessingMessage.value = '愿你今天开心';
    http.post.mockRejectedValueOnce(new Error('网络中断')).mockResolvedValueOnce({ data: wish({ canBless: false, blessings: [{ id: 1, self: true, message: '愿你今天开心' }] }) });
    await state.sendBlessing();
    expect(state.blessingMessage.value).toBe('愿你今天开心');
    await state.sendBlessing();
    expect(http.post.mock.calls[0][1]).toEqual(http.post.mock.calls[1][1]);
    expect(state.blessingMessage.value).toBe('');
    expect(state.wish.value.canBless).toBe(false);
  });

  it('appends paginated personal wishes without duplicates and keeps the cursor', async () => {
    const state = setupPage();
    http.get.mockResolvedValueOnce({ data: { items: [wish()], hasMore: true, nextCursor: '100' } });
    await state.loadList();
    http.get.mockResolvedValueOnce({ data: { items: [wish(), wish({ token: 'token-older' })], hasMore: false, nextCursor: null } });
    await state.loadList(true);
    expect(http.get.mock.calls[1]).toEqual(['/me/wishes', { params: { tab: 'created', cursor: '100' } }]);
    expect(state.items.value.map(item => item.token)).toEqual(['token-one', 'token-older']);
    expect(state.hasMore.value).toBe(false);
  });
});
