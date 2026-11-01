const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };
const notice = (id, unread = true, href = '/m/schedule/8') => ({ id, unread, href, title: '消息', body: '内容', createdAt: '2026-11-01 08:00:00' });
const inbox = (items, extra = {}) => ({ data: items, unread: 2, counts: { all: 4, unread: 2, read: 2 }, hasMore: false, nextCursor: null, ...extra });
function harness(request) {
  const app = { globalData: { token: 'a' } }, calls = { requests: [], navigation: [], toasts: [] };
  let definition;
  const filename = path.resolve(__dirname, '../../miniprogram/pages/notices/notices.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { definition = value; }, getApp: () => app,
    require: () => ({ request(...args) { calls.requests.push(args); return request(...args); } }),
    wx: { redirectTo: x => calls.navigation.push(x), navigateTo: x => calls.navigation.push(x), switchTab: x => calls.navigation.push(x), showToast: x => calls.toasts.push(x) },
  }, { filename });
  const page = { ...definition, data: structuredClone(definition.data) };
  page.setData = patch => Object.assign(page.data, patch);
  return { page, app, calls };
}
const event = data => ({ currentTarget: { dataset: data } });
describe('native message inbox', () => {
  it('changes read filters on the server and ignores responses from an older filter', async () => {
    const first = deferred(), next = deferred();
    const { page, calls } = harness(url => url.endsWith('read=all') ? first.promise : next.promise);
    const loading = page.onShow();
    const filtering = page.selectFilter(event({ filter: 'unread' }));
    next.resolve(inbox([notice(2)])); await filtering;
    first.resolve(inbox([notice(1, false)])); await loading;
    assert.equal(page.data.filter, 'unread');
    assert.equal(page.data.list[0].id, 2);
    assert.deepEqual(calls.requests.map(row => row[0]), ['/me/notices?read=all', '/me/notices?read=unread']);
  });
  it('keeps unread messages untouched when marking fails and offers retry after loading fails', async () => {
    let broken = false;
    const { page, calls } = harness((url, method) => method === 'POST' || broken ? Promise.reject(new Error('offline')) : Promise.resolve(inbox([notice(1)])));
    await page.onShow();
    await page.readAll();
    assert.equal(page.data.unread, 2);
    assert.equal(page.data.list[0].unread, true);
    await page.open(event({ index: 0 }));
    assert.equal(page.data.list[0].unread, true);
    assert.equal(calls.navigation.at(-1).url, '/pages/schedule/schedule?id=8');
    broken = true; await page.retry();
    assert.equal(page.data.error, 'offline');
    assert.equal(page.data.loading, false);
    broken = false; await page.retry();
    assert.equal(page.data.error, '');
  });
  it('loads older messages without duplicates and marks all across the selected filter', async () => {
    const { page, calls } = harness((url, method) => Promise.resolve(method === 'POST' ? inbox([]) : url.includes('beforeId') ? inbox([notice(2), notice(1)]) : inbox([notice(3), notice(2)], { hasMore: true, nextCursor: 2 })));
    await page.onShow();
    await page.loadMore();
    assert.deepEqual(Array.from(page.data.list, row => row.id), [3, 2, 1]);
    assert.equal(calls.requests[1][0], '/me/notices?read=all&beforeId=2');
    await page.readAll();
    assert.equal(calls.requests.filter(row => row[1] === 'POST').length, 1);
    assert.equal(page.data.readingAll, false);
  });
  it('clears private data on account change and ignores in-flight results from the old account', async () => {
    const stale = deferred();
    const { page, app } = harness(() => app.globalData.token === 'a' ? stale.promise : Promise.resolve(inbox([notice(9, false)])));
    const loading = page.onShow();
    app.globalData.token = 'b'; await page.onShow();
    stale.resolve(inbox([notice(1)])); await loading;
    assert.equal(page.data.list[0].id, 9);
    app.globalData.token = ''; await page.onShow();
    assert.equal(page.data.list.length, 0);
  });
  it('uses mark-all results directly and discards an older in-flight inbox request', async () => {
    const stale = deferred();
    let gets = 0;
    const { page, calls } = harness((url, method) => {
      if (method === 'POST') return Promise.resolve(inbox([], { unread: 0, counts: { all: 4, unread: 0, read: 4 } }));
      gets++;
      return gets === 1 ? Promise.resolve(inbox([notice(1)])) : stale.promise;
    });
    await page.selectFilter(event({ filter: 'unread' }));
    const refreshing = page.load();
    await page.readAll();
    stale.resolve(inbox([notice(1)])); await refreshing;
    assert.equal(gets, 2);
    assert.equal(calls.requests.at(-1)[2].read, 'unread');
    assert.equal(page.data.list.length, 0);
    assert.equal(page.data.unread, 0);
    assert.equal(page.data.counts.read, 4);
    assert.equal(page.data.loading, false);
  });
  it('refreshes a changed read filter when an earlier read operation completes', async () => {
    const marking = deferred();
    let gets = 0;
    const { page } = harness((url, method) => {
      if (method === 'POST') return marking.promise;
      gets++;
      return Promise.resolve(inbox(gets === 2 ? [] : [notice(1, gets === 1)]));
    });
    await page.selectFilter(event({ filter: 'unread' }));
    const opening = page.open(event({ index: 0 }));
    await page.selectFilter(event({ filter: 'read' }));
    marking.resolve(inbox([], { unread: 1, counts: { all: 4, unread: 1, read: 3 } }));
    await opening;
    assert.equal(gets, 3);
    assert.equal(page.data.filter, 'read');
    assert.equal(page.data.list[0].unread, false);
  });
  it('retains supported destination routing for orders, campus verification and travel wishes', async () => {
    for (const [href, url] of [
      ['/m/orders?tab=refund', '/pages/orders/orders'],
      ['/m/student', '/pages/student/student'],
      ['/m/route-apply', '/pages/route-apply/route-apply'],
      ['/m/wishes/abcdefghijklmnopqrst', '/pages/wishes/wishes?token=abcdefghijklmnopqrst'],
    ]) {
      const { page, calls } = harness(() => Promise.resolve(inbox([notice(1, false, href)])));
      await page.onShow(); await page.open(event({ index: 0 }));
      assert.equal(calls.navigation.at(-1).url, url);
    }
  });
});
