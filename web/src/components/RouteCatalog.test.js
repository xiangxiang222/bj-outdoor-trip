import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive } from 'vue';
import RouteCatalog from './RouteCatalog.vue';

const fixture = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('vue', async importOriginal => ({
  ...await importOriginal(),
  onMounted: vi.fn(),
  onUnmounted: vi.fn(),
  useSSRContext: () => ({ modules: new Set() }),
}));
vi.mock('@/api/http', () => ({ default: { get: fixture.get } }));

const options = () => [
  { key: 'great-wall', name: '长城', primary: true, count: 3 },
  { key: 'hiking', name: '徒步登山', primary: true, count: 4 },
  { key: 'coast', name: '海边', primary: true, count: 0 },
  { key: 'camping', name: '露营', primary: false, count: 1 },
  { key: 'water', name: '玩水', primary: false, count: 0 },
];
const scopes = [];
function setup(initial = {}) {
  const scope = effectScope();
  scopes.push(scope);
  const props = reactive({ q: '', preference: '', days: 0, preferenceOptions: options(), preferenceTotal: 8, preferencesLoading: false, preferencesError: false, ...initial });
  const emit = vi.fn((event, value) => { if (event.startsWith('update:')) props[event.slice('update:'.length)] = value; });
  const state = scope.run(() => RouteCatalog.setup(props, { emit, expose: vi.fn() }));
  return { state, props, emit };
}

describe('single route preference catalog', () => {
  beforeEach(() => { fixture.get.mockReset().mockResolvedValue({ data: [] }); });
  afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); });

  it.each(['great-wall', 'hiking', 'coast'])('selects %s as the only preference and preserves keyword and days', async preference => {
    const { state, props, emit } = setup({ preference: 'camping', q: ' 北京 ', days: 2 });
    state.preference.value = preference;
    await nextTick();
    expect(emit).toHaveBeenLastCalledWith('update:preference', preference);
    expect(props.q).toBe(' 北京 ');
    expect(props.days).toBe(2);
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: { preference, q: '北京', days: 2 } });
    expect(state.selectedFilters.value).toEqual([
      { key: 'preference', label: '偏好', value: options().find(option => option.key === preference).name },
      { key: 'days', label: '天数', value: '2日' },
      { key: 'q', label: '关键词', value: '北京' },
    ]);
    expect(emit.mock.calls.every(([event]) => event === 'update:preference')).toBe(true);
  });

  it('all preferences clears only the preference, while clear all also clears keyword and days', async () => {
    const { state, props } = setup({ preference: 'great-wall', q: '怀柔', days: 1 });
    state.preference.value = '';
    await nextTick();
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: { q: '怀柔', days: 1 } });
    expect(state.selectedFilters.value.map(filter => filter.key)).toEqual(['days', 'q']);
    state.preference.value = 'hiking';
    await nextTick();
    state.clearFilters();
    await nextTick();
    expect(props.preference).toBe('');
    expect(props.q).toBe('');
    expect(props.days).toBe(0);
    expect(state.selectedFilters.value).toEqual([]);
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: {} });
  });

  it('removes individual chips without changing the other conditions and labels the four-day boundary honestly', async () => {
    const { state, props } = setup({ preference: 'hiking', q: '森林', days: 'multi' });
    expect(state.selectedFilters.value.find(filter => filter.key === 'days').value).toBe('4日及以上');
    await state.load();
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: { preference: 'hiking', q: '森林', days: 'multi' } });
    state.clearFilter('q');
    await nextTick();
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: { preference: 'hiking', days: 'multi' } });
    state.clearFilter('preference');
    await nextTick();
    expect(props.preference).toBe('');
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: { days: 'multi' } });
  });

  it('keeps primary options at zero and shows only available extras, with a selected extra always in the main row', async () => {
    const { state, props } = setup();
    expect(state.visiblePreferences.value.map(option => option.key)).toEqual(['great-wall', 'hiking', 'coast']);
    expect(state.visiblePreferences.value.at(-1).count).toBe(0);
    expect(state.morePreferences.value.map(option => option.key)).toEqual(['camping']);
    state.moreOpen.value = true;
    state.preference.value = 'camping';
    await nextTick();
    expect(state.visiblePreferences.value.map(option => option.key)).toEqual(['great-wall', 'hiking', 'coast', 'camping']);
    expect(state.morePreferences.value).toEqual([]);
    state.moreOpen.value = false;
    props.preferenceOptions = options().map(option => ({ ...option, count: 0 }));
    await nextTick();
    expect(state.visiblePreferences.value.at(-1)).toMatchObject({ key: 'camping', count: 0 });
    expect(props.preference).toBe('camping');
    expect(state.morePreferences.value).toEqual([]);
  });

  it('does not broaden a zero-result preference and synchronizes external cards and renamed configuration', async () => {
    const { state, props } = setup({ preference: 'great-wall', q: '怀柔', days: 1 });
    props.preference = 'coast';
    await nextTick();
    expect(state.preference.value).toBe('coast');
    expect(props.q).toBe('怀柔');
    expect(props.days).toBe(1);
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: { preference: 'coast', q: '怀柔', days: 1 } });
    expect(state.list.value).toEqual([]);
    expect(props.preference).toBe('coast');
    props.preferenceOptions = options().map(option => option.key === 'coast' ? { ...option, name: '海岸慢游' } : option);
    await nextTick();
    expect(state.selectedFilters.value[0]).toEqual({ key: 'preference', label: '偏好', value: '海岸慢游' });
  });

  it('does not present stale or failed counts as inventory, and keeps the selected extra accessible', () => {
    const { state, props } = setup({ preference: 'camping', preferencesLoading: true });
    expect(state.countReady.value).toBe(false);
    expect(state.morePreferences.value).toEqual([]);
    expect(state.visiblePreferences.value.at(-1).key).toBe('camping');
    props.preferencesLoading = false;
    props.preferencesError = true;
    expect(state.countReady.value).toBe(false);
    expect(state.morePreferences.value).toEqual([]);
    props.preferencesError = false;
    expect(state.countReady.value).toBe(true);
  });

  it('reveals a selected preference using only horizontal movement inside its row', () => {
    const { state } = setup({ preference: 'camping' });
    const selected = { dataset: { preference: 'camping' }, getBoundingClientRect: () => ({ left: 400, right: 490 }) };
    const row = { scrollLeft: 0, scrollTop: 127, querySelectorAll: () => [selected], getBoundingClientRect: () => ({ left: 20, right: 300 }) };
    state.preferenceRow.value = row;
    state.revealPreference();
    expect(row.scrollLeft).toBe(194);
    expect(row.scrollTop).toBe(127);
  });

  it('retains the last route list after a failed reload and can retry the same exact preference', async () => {
    const { state, props } = setup({ preference: 'hiking', days: 2 });
    const cached = [{ id: 7, title: '百花山' }];
    fixture.get.mockResolvedValueOnce({ data: cached });
    await state.load();
    fixture.get.mockRejectedValueOnce(new Error('offline'));
    await state.load();
    expect(state.error.value).toBe(true);
    expect(state.list.value).toEqual(cached);
    expect(props.preference).toBe('hiking');
    fixture.get.mockResolvedValueOnce({ data: [] });
    await state.load();
    expect(state.error.value).toBe(false);
    expect(state.list.value).toEqual([]);
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: { preference: 'hiking', days: 2 } });
  });

  it('keeps a disabled selected shortcut visible with a clear error until the user cancels it', async () => {
    const { state, props, emit } = setup({ preference: 'coast', preferenceOptions: options().filter(option => option.key !== 'coast') });
    fixture.get.mockResolvedValueOnce({ data: [{ id: 27, title: '海边三日' }] });
    await state.load();
    expect(state.list.value).toHaveLength(1);
    state.brokenImages.value = { 27: true };
    fixture.get.mockRejectedValueOnce(Object.assign(new Error('preference disabled'), { code: 'ROUTE_PREFERENCE_UNAVAILABLE' }));
    await state.load();
    expect(state.error.value).toBe(true);
    expect(state.preferenceUnavailable.value).toBe(true);
    expect(state.list.value).toEqual([]);
    expect(state.brokenImages.value).toEqual({});
    expect(emit).toHaveBeenCalledWith('retry-preferences');
    expect(props.preference).toBe('coast');
    expect(state.visiblePreferences.value.at(-1)).toMatchObject({ key: 'coast', name: '海边', count: null });
    expect(state.selectedFilters.value).toEqual([{ key: 'preference', label: '偏好', value: '海边' }]);
    state.clearFilter('preference');
    await nextTick();
    expect(props.preference).toBe('');
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: {} });
  });

  it('does not refresh configuration or show an old unavailable error after a newer preference succeeds', async () => {
    const { state, props, emit } = setup({ preference: 'coast' });
    let rejectOlder;
    fixture.get.mockReturnValueOnce(new Promise((resolve, reject) => { rejectOlder = reject; }));
    const older = state.load();
    fixture.get.mockResolvedValueOnce({ data: [{ id: 7, title: '山野徒步' }] });
    props.preference = 'hiking';
    await nextTick();
    expect(state.list.value[0].id).toBe(7);
    rejectOlder(Object.assign(new Error('disabled'), { code: 'ROUTE_PREFERENCE_UNAVAILABLE' }));
    await older;
    expect(state.error.value).toBe(false);
    expect(state.preferenceUnavailable.value).toBe(false);
    expect(emit).not.toHaveBeenCalledWith('retry-preferences');
    expect(props.preference).toBe('hiking');
  });

  it('keeps the last known name of a selected custom preference when it disappears from public configuration', async () => {
    const custom = { key: 'custom-trip', name: '林间摄影', primary: false, count: 1 };
    const { state, props } = setup({ preference: custom.key, preferenceOptions: [...options(), custom] });
    expect(state.selectedFilters.value[0].value).toBe('林间摄影');
    props.preferenceOptions = options();
    await nextTick();
    expect(state.selectedFilters.value[0]).toEqual({ key: 'preference', label: '偏好', value: '林间摄影' });
    expect(state.visiblePreferences.value.at(-1)).toMatchObject({ key: 'custom-trip', name: '林间摄影', count: null });
    expect(props.preference).toBe('custom-trip');
  });

  it('updates the remembered name on rename or a new selection without leaking an earlier custom label', async () => {
    const custom = { key: 'custom-trip', name: '林间摄影', primary: false, count: 1 };
    const { state, props } = setup({ preference: custom.key, preferenceOptions: [...options(), custom] });
    props.preferenceOptions = [...options(), { ...custom, name: '森林寻光' }];
    await nextTick();
    props.preferenceOptions = options();
    await nextTick();
    expect(state.selectedFilters.value[0].value).toBe('森林寻光');
    state.preference.value = 'hiking';
    await nextTick();
    props.preferenceOptions = [];
    await nextTick();
    expect(state.selectedFilters.value[0].value).toBe('徒步登山');
    expect(state.visiblePreferences.value).toEqual([{ key: 'hiking', name: '徒步登山', count: null }]);
  });
});
