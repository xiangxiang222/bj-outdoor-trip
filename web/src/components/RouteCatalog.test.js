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

const scopes = [];
function setup(initial = {}) {
  const scope = effectScope();
  scopes.push(scope);
  const props = reactive({ q: '', category: '', seedTag: '', ...initial });
  // Apply controlled prop updates as the homepage does, without remounting.
  const emit = vi.fn((event, value) => { props[event.slice('update:'.length)] = value; });
  const state = scope.run(() => RouteCatalog.setup(props, { emit, expose: vi.fn() }));
  return { state, props, emit };
}

describe('route catalog selected conditions', () => {
  beforeEach(() => {
    fixture.get.mockReset().mockResolvedValue({ data: [] });
  });
  afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); });

  it('sends the exact inspiration category and displays it alongside other active conditions', async () => {
    const { state } = setup({ category: '海滨', q: ' 北戴河 ', seedTag: '摄影' });
    state.days.value = 2;
    await nextTick();
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: { category: '海滨', q: '北戴河', days: 2, tag: '摄影' } });
    expect(state.selectedFilters.value).toEqual([
      { key: 'category', label: '主题', value: '海滨' },
      { key: 'q', label: '关键词', value: '北戴河' },
      { key: 'days', label: '天数', value: '2日' },
      { key: 'tag', label: '玩法', value: '摄影' },
    ]);
  });

  it('removes the keyword without losing the selected theme, duration or play filter', async () => {
    const { state, props } = setup({ category: '海滨', q: '北戴河', seedTag: '摄影' });
    state.days.value = 'multi';
    await nextTick();
    state.clearFilter('q');
    await nextTick();
    expect(props.q).toBe('');
    expect(state.days.value).toBe('multi');
    expect(state.tag.value).toBe('摄影');
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: { category: '海滨', days: 'multi', tag: '摄影' } });
    expect(state.selectedFilters.value.some(filter => filter.key === 'q')).toBe(false);
  });

  it('removes an inspiration theme independently and can clear each local condition', async () => {
    const { state, props } = setup({ category: '登山', q: '森林', seedTag: '摄影' });
    state.days.value = 1;
    await nextTick();
    state.clearFilter('category');
    await nextTick();
    expect(props.category).toBe('');
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: { q: '森林', days: 1, tag: '摄影' } });
    state.clearFilter('days');
    state.clearFilter('tag');
    await nextTick();
    expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: { q: '森林' } });
  });

  it('clears all conditions including a keyword-only or category-only empty result', async () => {
    for (const condition of [{ q: '无匹配关键词' }, { category: '海滨' }, { q: '海边', category: '海滨', seedTag: '摄影' }]) {
      const { state, props } = setup(condition);
      if (condition.seedTag) state.days.value = 3;
      await state.load();
      state.clearFilters();
      await nextTick();
      expect(props.q).toBe('');
      expect(props.category).toBe('');
      expect(state.days.value).toBe(0);
      expect(state.tag.value).toBe('');
      expect(state.selectedFilters.value).toEqual([]);
      expect(fixture.get).toHaveBeenLastCalledWith('/routes', { params: {} });
    }
  });
});
