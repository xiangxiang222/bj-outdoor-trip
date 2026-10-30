import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderDetail from './OrderDetail.vue';

const fixture = vi.hoisted(() => ({ router: { push: vi.fn() } }));
vi.mock('vue', async importOriginal => {
  const vue = await importOriginal();
  return { ...vue, onMounted: vi.fn(), onBeforeUnmount: vi.fn(), watch: vi.fn(), useSSRContext: () => ({ modules: new Set() }) };
});
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: '12' }, query: {} }), useRouter: () => fixture.router }));
vi.mock('@/api/http', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/utils/appearance', () => ({ readLook: () => ({ lang: 'zh' }) }));

const setupPage = () => OrderDetail.setup({}, { expose: vi.fn() });
const eligible = (extra = {}) => ({ id: 12, canLinkWish: true, canPay: true, status: 'joined', pay_status: 'unpaid', schedule_status: 'recruiting', start_date: '2099-01-01', ...extra });

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
