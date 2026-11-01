import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderDetail from './OrderDetail.vue';
import http from '@/api/http';

const fixture = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn() }, store: { token: 'account-a' } }));
vi.mock('vue', async importOriginal => {
  const vue = await importOriginal();
  return { ...vue, onMounted: vi.fn(), onBeforeUnmount: vi.fn(), watch: vi.fn(), useSSRContext: () => ({ modules: new Set() }) };
});
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: '12' }, query: {} }), useRouter: () => fixture.router }));
vi.mock('@/api/http', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/stores/user', () => ({ useUserStore: () => fixture.store }));
vi.mock('@/utils/appearance', () => ({ readLook: () => ({ lang: 'zh' }) }));
vi.mock('@/stores/user', () => ({ useUserStore: () => ({ token: '' }) }));

const setupPage = () => OrderDetail.setup({}, { expose: vi.fn() });
const eligible = (extra = {}) => ({ id: 12, canLinkWish: true, canPay: true, status: 'joined', pay_status: 'unpaid', schedule_status: 'recruiting', start_date: '2099-01-01', ...extra });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };

describe('order detail account isolation', () => {
  beforeEach(() => { vi.clearAllMocks(); fixture.store.token = 'account-a'; vi.stubGlobal('window', {addEventListener:vi.fn(),removeEventListener:vi.fn()}); });
  it('clears an existing order immediately and loads the same id for the new account', async () => {
    const pending = deferred(); http.get.mockReturnValueOnce(pending.promise);
    const state = setupPage(); state.order.value = eligible({traveler_name:'账号甲'}); state.reviewOpen.value = true; state.form.value.content = '旧评价';
    fixture.store.token = 'account-b'; const loading = state.onAccountChange();
    expect(state.order.value).toBe(null); expect(state.reviewOpen.value).toBe(false); expect(state.form.value.content).toBe('');
    expect(http.get).toHaveBeenCalledWith('/orders/12');
    pending.resolve({data:eligible({traveler_name:'账号乙'})}); await loading;
    expect(state.order.value.traveler_name).toBe('账号乙');
  });
  it('does not repopulate old private data during an A to B to A account round trip', async () => {
    const first = deferred(), second = deferred(), third = deferred();
    http.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
    const state = setupPage(); const a = state.load(); fixture.store.token='account-b'; const b=state.onAccountChange(); fixture.store.token='account-a'; const fresh=state.onAccountChange();
    first.resolve({data:eligible({traveler_name:'过时甲'})}); second.resolve({data:eligible({traveler_name:'账号乙'})}); await a; await b;
    expect(state.order.value).toBe(null);
    third.resolve({data:eligible({traveler_name:'最新甲'})}); await fresh; expect(state.order.value.traveler_name).toBe('最新甲');
  });
  it('clears the order on logout before returning to login without requesting private data', async () => {
    const state=setupPage(); state.order.value=eligible(); fixture.store.token=''; await state.onAccountChange();
    expect(state.order.value).toBe(null); expect(http.get).not.toHaveBeenCalled();
    expect(fixture.router.replace).toHaveBeenCalledWith({path:'/m/login',query:{redirect:'/m/orders/12'}});
  });
});

describe('order detail travel wish entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });

  it('uses the verified enrollment id from the orders endpoint', () => {
    const state = setupPage();
    state.order.value = eligible();
    state.goWish();
    expect(fixture.router.push).toHaveBeenCalledWith({ path: '/m/wishes/new', query: { kind: 'trip', enrollmentId: '12' } });
  });

  it('prefers an explicit enrollment id over a different record id', () => {
    const state = setupPage();
    state.order.value = eligible({ id: 451, enrollment_id: 31 });
    state.goWish();
    expect(fixture.router.push).toHaveBeenCalledWith({ path: '/m/wishes/new', query: { kind: 'trip', enrollmentId: '31' } });
  });

  it('reopens the existing wish even when the order is paid instead of offering duplicate creation', () => {
    const state = setupPage();
    state.order.value = eligible({ canPay: false, canLinkWish: false, pay_status: 'paid', wishToken: 'existing-wish-token' });
    expect(state.wishEnrollmentId.value).toBe(0);
    state.goWish();
    expect(fixture.router.push).toHaveBeenCalledWith('/m/wishes/existing-wish-token');
  });

  it('does not offer creation when the server says this booking cannot be linked', () => {
    for (const extra of [
      { canLinkWish: false },
      { canPay: true, canLinkWish: false, status: 'joined', pay_status: 'unpaid', schedule_status: 'recruiting', start_date: '2099-01-01' },
      { canLinkWish: true, id: -1 },
      { canLinkWish: true, id: 12, enrollment_id: 0 },
    ]) {
      const state = setupPage();
      state.order.value = eligible(extra);
      expect(state.wishEnrollmentId.value).toBe(0);
      state.goWish();
    }
    expect(fixture.router.push).not.toHaveBeenCalled();
  });
});


describe('order detail state presentation and route actions', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('window', {addEventListener:vi.fn(),removeEventListener:vi.fn()}); });
  it('shows only the remaining amount as due on a partial payment', () => {
    const state = setupPage();
    state.order.value = eligible({payAmount:30,paidAmount:10,remainAmount:20});
    expect(state.amount.value).toBe(20);
    expect(state.amountLabel.value).toBe('剩余待付');
    state.order.value = {...state.order.value,canPay:false,pay_status:'paid'};
    expect(state.amount.value).toBe(30);
    expect(state.amountLabel.value).toBe('费用合计');
  });
  it('recognizes one-off activity kinds and never navigates to their synthetic routes', () => {
    const state=setupPage();
    for (const [category,icon] of [['掼蛋','cards'],['跑步','run'],['电影','movie'],['招募','club']]) {
      state.order.value=eligible({channel:'activity',category,route_id:9,completed:true,start_date:'2020-01-01',canPay:false,pay_status:'paid'});
      expect(state.activity.value).toBe(true); expect(state.icon.value).toBe(icon); expect(state.again.value).toBe(false); state.goOtherDates();
    }
    expect(fixture.router.push).not.toHaveBeenCalled();
    state.order.value={...state.order.value,channel:'trip',schedule_status:'finished'};
    state.goOtherDates(); expect(fixture.router.push).toHaveBeenCalledWith('/m/route/9');
  });
});
