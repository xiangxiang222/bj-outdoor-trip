const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { harness, loginUser, loginCompany, auth } = require('./http');
const { getDb } = require('../src/db');

describe('user message inbox', () => {
  let agent, seed, token;
  beforeEach(async () => {
    ({ agent, seed } = harness());
    token = await loginUser(agent);
  });
  function add(userId, count, unread = true) {
    const sql = getDb().prepare("INSERT INTO user_notices (user_id,kind,title,body,href,read_at) VALUES (?,?,?,?,?,?)");
    return Array.from({ length: count }, (_, i) => Number(sql.run(userId, 'trip', '报名消息' + i, '最新状态', '/m/schedule/1', unread ? null : '2026-11-01 08:00:00').lastInsertRowid));
  }
  it('filters over the full inbox and keeps a stable cursor when newer messages arrive', async () => {
    const ids = add(seed.userId, 57);
    add(seed.userId, 9, false);
    add(seed.companyUserId, 7);
    const first = await agent.get('/api/me/notices?read=unread').set(auth(token)).expect(200);
    assert.equal(first.body.data.length, 50);
    assert.deepEqual(first.body.counts, { all: 66, unread: 57, read: 9 });
    assert.equal(first.body.total, 57);
    assert.equal(first.body.hasMore, true);
    assert.equal(first.body.nextCursor, ids[7]);
    assert.ok(first.body.data.every(item => item.unread));
    add(seed.userId, 1);
    const second = await agent.get('/api/me/notices?read=unread&beforeId=' + first.body.nextCursor).set(auth(token)).expect(200);
    assert.equal(second.body.data.length, 7);
    assert.equal(second.body.hasMore, false);
    assert.equal(second.body.nextCursor, null);
    assert.deepEqual(second.body.data.map(item => item.id), ids.slice(0, 7).reverse());
    assert.equal(new Set([...first.body.data, ...second.body.data].map(item => item.id)).size, 57);
    const read = await agent.get('/api/me/notices?read=read').set(auth(token)).expect(200);
    assert.equal(read.body.data.length, 9);
    assert.ok(read.body.data.every(item => !item.unread));
  });
  it('marks every unread notice, including messages beyond the first page, without affecting another user', async () => {
    add(seed.userId, 75);
    const otherIds = add(seed.companyUserId, 1);
    const all = await agent.post('/api/me/notices/read-all').set(auth(token)).send({ read: 'unread' }).expect(200);
    assert.equal(all.body.data.length, 0);
    assert.equal(all.body.unread, 0);
    assert.deepEqual(all.body.counts, { all: 75, unread: 0, read: 75 });
    const other = await loginCompany(agent);
    await agent.post('/api/me/notices/' + otherIds[0] + '/read').set(auth(token)).expect(200);
    const theirs = await agent.get('/api/me/notices').set(auth(other)).expect(200);
    assert.equal(theirs.body.unread, 1);
    const read = await agent.get('/api/me/notices?read=read&limit=100').set(auth(token)).expect(200);
    assert.equal(read.body.data.length, 75);
  });
  it('updates full counts on a single read and validates pagination before changing messages', async () => {
    const ids = add(seed.userId, 2);
    const one = await agent.post('/api/me/notices/' + ids[0] + '/read').set(auth(token)).send({ read: 'unread' }).expect(200);
    assert.deepEqual(one.body.counts, { all: 2, unread: 1, read: 1 });
    assert.deepEqual(one.body.data.map(item => item.id), [ids[1]]);
    for (const query of ['read=other', 'limit=0', 'limit=101', 'beforeId=-1', 'beforeId=no', 'beforeId=1.1']) {
      await agent.get('/api/me/notices?' + query).set(auth(token)).expect(400);
    }
    await agent.post('/api/me/notices/read-all').set(auth(token)).send({ read: 'other' }).expect(400);
    const res = await agent.get('/api/me/notices').set(auth(token)).expect(200);
    assert.equal(res.body.unread, 1);
    await agent.get('/api/me/notices').expect(401);
  });
});
