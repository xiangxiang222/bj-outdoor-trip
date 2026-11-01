import { beforeEach, describe, expect, it, vi } from 'vitest';
import Notices from './Notices.vue';
import http from '@/api/http';

const fixture = vi.hoisted(() => ({ store: { token: 'a' }, router: { push: vi.fn(), replace: vi.fn() } }));
vi.mock('vue', async importOriginal => {
  const vue = await importOriginal();
  return { ...vue, onMounted: vi.fn(), onBeforeUnmount: vi.fn(), watch: vi.fn(), useSSRContext: () => ({ modules: new Set() }) };
});
vi.mock('vue-router', () => ({ useRoute: () => ({ fullPath: '/m/notices' }), useRouter: () => fixture.router }));
vi.mock('@/api/http', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/stores/user', () => ({ useUserStore: () => fixture.store }));
const setup = () => Notices.setup({}, { expose: vi.fn() });
const notice = (id, unread = true) => ({ id, unread, href: '/m/schedule/8', title: '报名消息' });
const inbox = (rows, extra = {}) => ({ data: rows, unread: 2, counts: { all: 4, unread: 2, read: 2 }, hasMore: false, nextCursor: null, ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };

describe('message center filtering and reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.store.token = 'a';
    http.get.mockResolvedValue(inbox([notice(1)]));
    http.post.mockResolvedValue(inbox([]));
  });
  it('filters all/read/unread server-side rather than filtering the latest page', async () => {
    const state = setup();
    await state.load();
    await state.selectFilter('read');
    expect(http.get).toHaveBeenLastCalledWith('/me/notices', { params: { read: 'read' } });
    expect(state.filter.value).toBe('read');
    expect(state.counts.value.read).toBe(2);
  });
  it('keeps a newer filter response when the previous request resolves late', async () => {
    const first = deferred(), second = deferred();
    http.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const state = setup();
    const oldLoad = state.load();
    const newLoad = state.selectFilter('unread');
    second.resolve(inbox([notice(2)])); await newLoad;
    first.resolve(inbox([notice(1, false)])); await oldLoad;
    expect(state.list.value.map(row => row.id)).toEqual([2]);
  });
  it('paginates with an id cursor and avoids duplicate rows', async () => {
    http.get.mockResolvedValueOnce(inbox([notice(3), notice(2)], { hasMore: true, nextCursor: 2 })).mockResolvedValueOnce(inbox([notice(2), notice(1)]));
    const state = setup();
    await state.load(); await state.load(true);
    expect(http.get).toHaveBeenLastCalledWith('/me/notices', { params: { read: 'all', beforeId: 2 } });
    expect(state.list.value.map(row => row.id)).toEqual([3, 2, 1]);
  });
  it('does not claim a failed read succeeded and still opens the relevant activity', async () => {
    const state = setup(); await state.load();
    http.post.mockRejectedValue(new Error('offline'));
    await state.readAll();
    expect(state.unread.value).toBe(2);
    expect(state.readingAll.value).toBe(false);
    await state.open(state.list.value[0]);
    expect(state.list.value[0].unread).toBe(true);
    expect(fixture.router.push).toHaveBeenCalledWith('/m/schedule/8');
    expect(state.error.value).toBe('标记失败，请重试');
  });
  it('removes a successfully read message from unread while retaining global counts', async () => {
    const state = setup(); await state.selectFilter('unread');
    http.post.mockResolvedValue(inbox([], { unread: 1, counts: { all: 4, unread: 1, read: 3 } }));
    await state.open(state.list.value[0]);
    expect(state.list.value).toEqual([]);
    expect(state.unread.value).toBe(1);
    expect(state.counts.value.read).toBe(3);
  });
  it('applies the successful mark-all response without requiring a second network request', async () => {
    const state = setup(); await state.selectFilter('unread');
    http.post.mockResolvedValue(inbox([], { unread: 0, counts: { all: 4, unread: 0, read: 4 } }));
    http.get.mockRejectedValue(new Error('offline'));
    await state.readAll();
    expect(http.post).toHaveBeenCalledWith('/me/notices/read-all', { read: 'unread' });
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(state.list.value).toEqual([]);
    expect(state.unread.value).toBe(0);
    expect(state.counts.value.read).toBe(4);
    expect(state.error.value).toBe('');
  });
  it('refreshes the read filter if a message finishes marking after the filter has changed', async () => {
    const marking = deferred();
    const state = setup(); await state.selectFilter('unread');
    http.post.mockReturnValue(marking.promise);
    const opening = state.open(state.list.value[0]);
    http.get.mockResolvedValueOnce(inbox([])).mockResolvedValueOnce(inbox([notice(1, false)]));
    await state.selectFilter('read');
    marking.resolve(inbox([], { unread: 1, counts: { all: 4, unread: 1, read: 3 } }));
    await opening;
    expect(http.get).toHaveBeenLastCalledWith('/me/notices', { params: { read: 'read' } });
    expect(state.list.value.map(row => row.id)).toEqual([1]);
    expect(state.list.value[0].unread).toBe(false);
  });
  it('does not display private results when an account changes during a request', async () => {
    const pending = deferred();
    http.get.mockReturnValueOnce(pending.promise);
    const state = setup();
    const request = state.load();
    fixture.store.token = 'b';
    pending.resolve(inbox([notice(1)])); await request;
    expect(state.list.value).toEqual([]);
  });
  it('shows a recoverable load error and clears it on retry', async () => {
    const state = setup();
    http.get.mockRejectedValueOnce(new Error('网络异常'));
    await state.load();
    expect(state.error.value).toBe('网络异常');
    expect(state.loading.value).toBe(false);
    await state.load();
    expect(state.error.value).toBe('');
    expect(state.list.value).toHaveLength(1);
  });
});
