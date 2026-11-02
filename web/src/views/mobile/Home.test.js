import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import Home from './Home.vue';

const fixture = vi.hoisted(() => ({
  route: { query: {} },
  router: { push: vi.fn(), replace: vi.fn() },
  store: { token: '', fetchMe: vi.fn() },
  scroller: { scrollTo: vi.fn(), cancel: vi.fn() },
  get: vi.fn(),
}));

vi.mock('vue', async importOriginal => {
  const vue = await importOriginal();
  return {
    ...vue,
    onMounted: vi.fn(),
    onUnmounted: vi.fn(),
    useSSRContext: () => ({ modules: new Set() }),
  };
});
vi.mock('vue-router', () => ({ useRoute: () => fixture.route, useRouter: () => fixture.router }));
vi.mock('@/stores/user', () => ({ useUserStore: () => fixture.store }));
vi.mock('@/api/http', () => ({ default: { get: fixture.get, post: vi.fn() } }));
vi.mock('@/utils/resultScroll', () => ({ createResultScroller: () => fixture.scroller }));

const scopes = [];
function setup() {
  const scope = effectScope();
  scopes.push(scope);
  const state = scope.run(() => Home.setup({}, { expose: vi.fn() }));
  state.feedStart.value = {};
  return { state, scroll: fixture.scroller.scrollTo };
}
const slides = count => Array.from({ length: count }, (_, index) => ({
  url: `/static/photos/hero-${index}.jpg`, routeId: index + 1, title: `风景 ${index + 1}`,
}));

describe('homepage destination discovery and hero state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.get.mockResolvedValue({ data: { options: [], total: 0 } });
    fixture.route.query = {};
  });
  afterEach(() => {
    scopes.splice(0).forEach(scope => scope.stop());
  });

  it.each([2, 5])('uses all %i configured slides for selection and wrapping', count => {
    const { state } = setup();
    const configured = slides(count);
    state.home.value = { brand: { slides: configured } };
    expect(state.brandSlides.value).toEqual(configured);
    state.heroIndex.value = count - 1;
    expect(state.activeHeroIndex.value).toBe(count - 1);
    expect(state.brandSlide.value.routeId).toBe(count);
    expect(state.heroSource.value).toBe(configured[count - 1].url);
    state.heroIndex.value = count;
    expect(state.activeHeroIndex.value).toBe(0);
    expect(state.brandSlide.value.routeId).toBe(1);
  });

  it('keeps the selected image and index in range when the configured slide count changes', () => {
    const { state } = setup();
    state.home.value = { brand: { slides: slides(5) } };
    state.heroIndex.value = 4;
    expect(state.brandSlide.value.routeId).toBe(5);
    state.home.value.brand.slides = slides(2);
    expect(state.brandSlides.value).toHaveLength(2);
    expect(state.activeHeroIndex.value).toBe(0);
    expect(state.brandSlide.value.routeId).toBe(1);
    state.home.value.brand.slides = [slides(1)[0], null, { url: '' }];
    expect(state.brandSlides.value).toHaveLength(1);
    expect(state.activeHeroIndex.value).toBe(0);
    expect(state.heroSource.value).toBe('/static/photos/hero-0.jpg');
  });

  it('uses a valid gallery when slides are absent and the default photos when both are empty', () => {
    const { state } = setup();
    state.home.value = { brand: { slides: [null, { url: '' }], gallery: ['', '/static/photos/gallery.jpg', null] } };
    state.heroIndex.value = 5;
    expect(state.brandSlides.value.map(slide => slide.url)).toEqual(['/static/photos/gallery.jpg']);
    expect(state.activeHeroIndex.value).toBe(0);
    expect(state.heroSource.value).toBe('/static/photos/gallery.jpg');
    state.home.value = { brand: { slides: [], gallery: [] } };
    expect(state.brandSlides.value.map(slide => slide.url)).toEqual(state.fallbackPhotos);
    expect(state.activeHeroIndex.value).toBe(2);
    expect(state.heroSource.value).toBe(state.fallbackPhotos[2]);
  });

  it('starts a destination route search without a hidden trip tag and preserves days and the chosen trip date', async () => {
    const { state, scroll } = setup();
    state.tag.value = '徒步';
    state.query.value = '旧搜索';
    state.routePreference.value = 'coast';
    state.routeDays.value = 2;
    state.date.value = '2099-04-08';
    await state.searchDestination('长城');
    expect(state.view.value).toBe('routes');
    expect(state.tag.value).toBe('徒步');
    expect(state.query.value).toBe('长城');
    expect(state.routePreference.value).toBe('');
    expect(state.routeDays.value).toBe(2);
    expect(state.date.value).toBe('2099-04-08');
    expect(fixture.router.replace).toHaveBeenLastCalledWith({ path: '/m', query: { view: 'routes' } });
    expect(scroll).toHaveBeenCalledWith(state.feedStart.value);
  });

  it('keeps days when the same destination is chosen again without rebuilding the catalog', async () => {
    fixture.route.query = { view: 'routes' };
    const { state, scroll } = setup();
    state.query.value = '长城';
    state.routeDays.value = 3;
    await state.searchDestination('长城');
    await state.searchDestination('长城');
    expect(state.view.value).toBe('routes');
    expect(state.query.value).toBe('长城');
    expect(state.tag.value).toBe('');
    expect(state.routeDays.value).toBe(3);
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it('discovers upcoming trips without imposing a weekend or clearing a selected date', async () => {
    fixture.route.query = { view: 'routes' };
    const { state, scroll } = setup();
    await state.discoverJourney();
    expect(state.view.value).toBe('trips');
    expect(state.timePreset.value).toBe('any');
    expect(state.date.value).toBe('');
    expect(state.hasTimeFilter.value).toBe(false);
    state.view.value = 'routes';
    state.date.value = '2099-04-08';
    await state.discoverJourney();
    expect(state.view.value).toBe('trips');
    expect(state.date.value).toBe('2099-04-08');
    expect(state.timePreset.value).toBe('any');
    expect(state.customTimeSelected.value).toBe(true);
    expect(fixture.router.replace).toHaveBeenLastCalledWith({ path: '/m', query: {} });
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it('waits for the selected catalog to render before moving from a shortcut', async () => {
    const { state, scroll } = setup();
    const pending = state.discoverRoutes();
    expect(state.view.value).toBe('routes');
    expect(fixture.scroller.cancel).toHaveBeenCalledOnce();
    expect(scroll).not.toHaveBeenCalled();
    await pending;
    expect(scroll).toHaveBeenCalledWith(state.feedStart.value);
  });

  it.each(['great-wall', 'hiking', 'coast'])('selects %s from the same single preference and keeps keyword, days and date', async preference => {
    const { state, scroll } = setup();
    state.tag.value = '徒步';
    state.query.value = '海';
    state.routeDays.value = 2;
    state.date.value = '2099-04-08';
    await state.discoverInspiration(preference);
    expect(state.view.value).toBe('routes');
    expect(state.routePreference.value).toBe(preference);
    expect(state.tag.value).toBe('徒步');
    expect(state.query.value).toBe('海');
    expect(state.routeDays.value).toBe(2);
    expect(state.date.value).toBe('2099-04-08');
    expect(scroll).toHaveBeenCalledWith(state.feedStart.value);
  });

  it('retains route days and preference through trips and routes, with local choices causing no scroll', async () => {
    const { state, scroll } = setup();
    state.routeDays.value = 'multi';
    state.routePreference.value = 'camping';
    state.setView('trips');
    state.setView('routes');
    await nextTick();
    expect(state.routeDays.value).toBe('multi');
    expect(state.routePreference.value).toBe('camping');
    expect(scroll).not.toHaveBeenCalled();
    expect(fixture.scroller.cancel).not.toHaveBeenCalled();
  });

  it('uses configured preference names for the cards and refreshes counts only for keyword or days', async () => {
    const { state } = setup();
    fixture.get.mockResolvedValue({ data: { options: [{ key: 'hiking', name: '山径漫步', primary: true, count: 2 }], total: 2 } });
    await state.loadRoutePreferences();
    expect(state.preferenceName(state.routePreferenceOptions.value, 'hiking')).toBe('山径漫步');
    fixture.get.mockClear();
    state.routePreference.value = 'hiking';
    await nextTick();
    expect(fixture.get).not.toHaveBeenCalled();
    state.query.value = ' 怀柔 ';
    state.routeDays.value = 2;
    await nextTick();
    expect(fixture.get).toHaveBeenLastCalledWith('/route-preferences', { params: { q: '怀柔', days: 2 } });
  });

  it('hides disabled inspiration cards after configuration loads without clearing an existing selection', async () => {
    const { state, scroll } = setup();
    expect(state.destinations.value.map(card => card.preference)).toEqual(['great-wall', 'hiking', 'coast']);
    state.routePreference.value = 'coast';
    fixture.get.mockResolvedValue({ data: { options: [{ key: 'hiking', name: '山径漫步', primary: true, count: 0 }], total: 0 } });
    await state.loadRoutePreferences();
    expect(state.routePreferencesLoaded.value).toBe(true);
    expect(state.destinations.value.map(card => card.preference)).toEqual(['hiking']);
    expect(state.routePreference.value).toBe('coast');
    await state.discoverInspiration('coast');
    expect(scroll).not.toHaveBeenCalled();
    expect(state.view.value).toBe('trips');
    expect(state.routePreference.value).toBe('coast');
    fixture.get.mockResolvedValue({ data: { options: [], total: 0 } });
    await state.loadRoutePreferences();
    expect(state.destinations.value).toEqual([]);
  });

  it('retains fallback cards on an initial configuration failure without pretending it loaded successfully', async () => {
    const { state } = setup();
    fixture.get.mockRejectedValueOnce(new Error('offline'));
    await state.loadRoutePreferences();
    expect(state.routePreferencesError.value).toBe(true);
    expect(state.routePreferencesLoaded.value).toBe(false);
    expect(state.destinations.value).toHaveLength(3);
  });
});
