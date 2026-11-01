import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import Home from './Home.vue';

const fixture = vi.hoisted(() => ({
  route: { query: {} },
  router: { push: vi.fn(), replace: vi.fn() },
  store: { token: '', fetchMe: vi.fn() },
  scroller: { scrollTo: vi.fn(), cancel: vi.fn() },
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
vi.mock('@/api/http', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
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

  it('starts a destination route search without an old play tag or losing the chosen trip date', async () => {
    const { state, scroll } = setup();
    state.tag.value = '徒步';
    state.query.value = '旧搜索';
    state.routeCategory.value = '海滨';
    state.date.value = '2099-04-08';
    await state.searchDestination('长城');
    expect(state.view.value).toBe('routes');
    expect(state.tag.value).toBe('');
    expect(state.query.value).toBe('长城');
    expect(state.routeCategory.value).toBe('');
    expect(state.date.value).toBe('2099-04-08');
    expect(state.routeSearchVersion.value).toBe(1);
    expect(fixture.router.replace).toHaveBeenLastCalledWith({ path: '/m', query: { view: 'routes' } });
    expect(scroll).toHaveBeenCalledWith(state.feedStart.value);
  });

  it('starts a fresh catalog even when the same destination is chosen again in route view', async () => {
    fixture.route.query = { view: 'routes' };
    const { state, scroll } = setup();
    state.query.value = '长城';
    const previous = state.routeSearchVersion.value;
    await state.searchDestination('长城');
    await state.searchDestination('长城');
    expect(state.view.value).toBe('routes');
    expect(state.query.value).toBe('长城');
    expect(state.tag.value).toBe('');
    expect(state.routeSearchVersion.value).toBe(previous + 2);
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

  it.each(['长城', '登山', '海滨'])('opens the %s inspiration as an exact category without old keyword or play filters', async category => {
    const { state, scroll } = setup();
    state.tag.value = '徒步';
    state.query.value = '海';
    state.date.value = '2099-04-08';
    await state.discoverInspiration(category);
    expect(state.view.value).toBe('routes');
    expect(state.routeCategory.value).toBe(category);
    expect(state.tag.value).toBe('');
    expect(state.query.value).toBe('');
    expect(state.date.value).toBe('2099-04-08');
    expect(state.routeSearchVersion.value).toBe(1);
    expect(scroll).toHaveBeenCalledWith(state.feedStart.value);
  });
});
