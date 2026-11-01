import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScheduleDetail from './ScheduleDetail.vue';

const fixture = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn() } }));
vi.mock('vue', async importOriginal => {
  const vue = await importOriginal();
  return { ...vue, onMounted: vi.fn(), onUnmounted: vi.fn(), watch: vi.fn(), useSSRContext: () => ({ modules: new Set() }) };
});
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: '10' }, query: {} }), useRouter: () => fixture.router }));
vi.mock('@/stores/user', () => ({ useUserStore: () => ({ token: 'test', profile: {} }) }));
vi.mock('@/api/http', () => ({ default: { get: vi.fn().mockRejectedValue(new Error('offline')), post: vi.fn() } }));
vi.mock('@/utils/pageChrome', () => ({ setChrome: vi.fn() }));

const setup = () => ScheduleDetail.setup({}, { expose: vi.fn() });
const activity = (patch = {}) => ({ channel: 'activity', startDate: '2099-01-01', endDate: '2099-01-01', meetupTime: '19:30', status: 'recruiting', reviewStatus: 'approved', enrolled: 1, maxSeats: 12, remain: 11, route: { category: '掼蛋', title: '新手局' }, quote: { price: 0, originPrice: 0 }, ...patch });

describe('one-off city activity details', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('keeps ended details as an attendance record without remaining seats or attend instructions', () => {
    const state = setup();
    state.s.value = activity({ startDate: '2020-01-01', endDate: '2020-01-01', myEnrollment: { status: 'joined', payStatus: 'paid', remainAmount: 0 } });
    expect(state.activityPresentation.value.title).toBe('活动已结束');
    expect(state.showEnroll.value).toBe(false);
    expect(state.dockVisible.value).toBe(false);
    expect(state.ticket.value.share).toBe(false);
    expect(state.peopleText.value).toBe('已报名 1 人');
    expect(state.activityGroupEmpty.value).not.toMatch(/到场|付款/);
  });

  it.each([
    [{ status: 'waitlist' }, '候补中'],
    [{ status: 'applied' }, '报名待确认'],
    [{ status: 'joined', remainAmount: 20 }, '待付款'],
    [{ status: 'joined', remainAmount: 0 }, '已报名'],
  ])('distinguishes enrollment states before the event', (myEnrollment, title) => {
    const state = setup();
    state.s.value = activity({ myEnrollment });
    expect(state.activityPresentation.value.title).toBe(title);
    expect(state.showEnroll.value).toBe(false);
  });

  it('rechecks the clock at enrollment when a page was left open until the activity started', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-01T19:29:00+08:00'));
    const state = setup();
    state.s.value = activity({ startDate: '2026-11-01', endDate: '2026-11-01' });
    expect(state.showEnroll.value).toBe(true);
    clock.mockReturnValue(Date.parse('2026-11-01T19:30:00+08:00'));
    state.goEnroll();
    expect(fixture.router.push).not.toHaveBeenCalled();
    expect(state.msg.value).toBe('本次活动已关闭报名');
  });

  it('allows pending organizer cancellation independently of enrollment controls and honors server restrictions', () => {
    const state = setup();
    state.s.value = activity({ isOrganizer: true, reviewStatus: 'pending', startDate: '2020-01-01', canDissolve: true });
    expect(state.showEnroll.value).toBe(false);
    expect(state.canDissolve.value).toBe(true);
    state.s.value = activity({ isOrganizer: true, canDissolve: false });
    expect(state.canDissolve.value).toBe(false);
  });

  it('never renders generated QR fallbacks and removes failed uploaded images', () => {
    const state = setup();
    state.s.value = activity({ consultGroupQr: '/api/qr?text=官方微信群' });
    expect(state.activityGroupQr.value).toBe('');
    state.s.value = activity({ consultGroupQr: 'https://example.test/static/uploads/activity-group.png' });
    expect(state.activityGroupQr.value).toBe(state.s.value.consultGroupQr);
    state.groupQrError();
    expect(state.activityGroupQr.value).toBe('');
    expect(state.activityGroupQrError.value).toBe(true);
  });
});
