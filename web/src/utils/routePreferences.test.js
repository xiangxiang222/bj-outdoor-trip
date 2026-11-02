import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { preferenceName, useRoutePreferences } from './routePreferences';

const fixture = vi.hoisted(() => ({ get: vi.fn(), mounts: [], unmounts: [] }));
vi.mock('vue', async importOriginal => ({
  ...await importOriginal(),
  onMounted: callback => fixture.mounts.push(callback),
  onUnmounted: callback => fixture.unmounts.push(callback),
}));
vi.mock('@/api/http', () => ({ default: { get: fixture.get } }));

const inventory = (name = '徒步登山', count = 3) => ({ data: { total: 6, options: [
  { key: 'great-wall', name: '长城', primary: true, count: 2 },
  { key: 'hiking', name, primary: true, count },
  { key: 'coast', name: '海边', primary: true, count: 0 },
  { key: 'camping', name: '露营', primary: false, count: 1 },
] } });
const scopes = [];
function setup(q = '', selectedDays = 0) {
  const scope = effectScope();
  scopes.push(scope);
  const query = ref(q), days = ref(selectedDays);
  const state = scope.run(() => useRoutePreferences(query, days));
  return { state, query, days };
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe('route preference configuration and contextual counts', () => {
  beforeEach(() => {
    fixture.get.mockReset().mockResolvedValue(inventory());
    fixture.mounts.length = fixture.unmounts.length = 0;
  });
  afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); });

  it('starts with named primary shortcuts without invented counts and accepts dynamic names and zero inventory', async () => {
    const { state } = setup(' 怀柔 ', 2);
    expect(state.total.value).toBe(null);
    expect(state.options.value.map(option => [option.key, option.count])).toEqual([['great-wall', null], ['hiking', null], ['coast', null]]);
    fixture.get.mockResolvedValue(inventory('山径漫步'));
    await fixture.mounts[0]();
    expect(fixture.get).toHaveBeenLastCalledWith('/route-preferences', { params: { q: '怀柔', days: 2 } });
    expect(preferenceName(state.options.value, 'hiking')).toBe('山径漫步');
    expect(state.options.value.find(option => option.key === 'coast').count).toBe(0);
    expect(state.total.value).toBe(6);
    expect(state.error.value).toBe(false);
  });

  it('counts for the current keyword and duration while omitting the selected preference entirely', async () => {
    const { state, query, days } = setup();
    await state.load();
    fixture.get.mockClear();
    query.value = ' 北京 ';
    days.value = 'multi';
    await nextTick();
    expect(fixture.get).toHaveBeenCalledTimes(1);
    expect(fixture.get).toHaveBeenCalledWith('/route-preferences', { params: { q: '北京', days: 'multi' } });
  });

  it('removes stale numbers during an update and ignores an older response after newer conditions finish', async () => {
    const { state, query } = setup();
    await state.load();
    const old = deferred(), latest = deferred();
    fixture.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const first = state.load();
    expect(state.loading.value).toBe(true);
    expect(state.total.value).toBe(null);
    expect(state.options.value.every(option => option.count === null)).toBe(true);
    query.value = '海';
    await nextTick();
    latest.resolve(inventory('新配置', 1));
    await latest.promise;
    await nextTick();
    expect(preferenceName(state.options.value, 'hiking')).toBe('新配置');
    expect(state.loading.value).toBe(false);
    old.resolve(inventory('旧配置', 99));
    await first;
    expect(preferenceName(state.options.value, 'hiking')).toBe('新配置');
    expect(state.options.value.find(option => option.key === 'hiking').count).toBe(1);
  });

  it('reports count failures honestly, retains names without numbers, and can retry', async () => {
    const { state } = setup();
    await state.load();
    fixture.get.mockRejectedValueOnce(new Error('offline'));
    await state.load();
    expect(state.error.value).toBe(true);
    expect(state.loading.value).toBe(false);
    expect(state.total.value).toBe(null);
    expect(state.options.value.every(option => option.count === null)).toBe(true);
    expect(preferenceName(state.options.value, 'hiking')).toBe('徒步登山');
    fixture.get.mockResolvedValueOnce(inventory('恢复的配置', 4));
    await state.load();
    expect(state.error.value).toBe(false);
    expect(state.options.value.find(option => option.key === 'hiking')).toMatchObject({ name: '恢复的配置', count: 4 });
  });

  it.each([
    { options: [], total: -1 },
    { options: [{ key: 'x', name: '线路', primary: true, count: null }], total: 1 },
    { options: [{ key: 'x', name: '线路', primary: true, count: 1 }, { key: 'x', name: '重复', primary: false, count: 1 }], total: 1 },
  ])('rejects malformed count data instead of converting it to zero', async data => {
    const { state } = setup();
    fixture.get.mockResolvedValueOnce({ data });
    await state.load();
    expect(state.error.value).toBe(true);
    expect(state.total.value).toBe(null);
    expect(state.options.value.every(option => option.count === null)).toBe(true);
  });

  it('does not apply a late response after leaving the homepage', async () => {
    const pending = deferred();
    fixture.get.mockReturnValueOnce(pending.promise);
    const { state } = setup();
    const load = state.load();
    fixture.unmounts[0]();
    pending.resolve(inventory());
    await load;
    expect(state.total.value).toBe(null);
    expect(state.options.value.every(option => option.count === null)).toBe(true);
  });
});
