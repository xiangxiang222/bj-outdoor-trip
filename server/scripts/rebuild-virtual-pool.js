/**
 * 只删除 is_virtual=1 的账号及其占座、评价，再按现有规则补满虚拟用户池。
 * 用法：node scripts/rebuild-virtual-pool.js [人数]
 */
const { getDb } = require("../src/db");
const { createVirtualUser, virtualPoolStats } = require("../src/services/virtual");
const config = require("../src/config");

const target = Math.min(2000, Math.max(1, Number(process.argv[2] || config.virtualHeat?.poolSize || 2000)));

function quote(name) {
  return `"${String(name).replace(/"/g, "")}"`;
}

function purge() {
  const db = getDb();
  const before = db.prepare("SELECT COUNT(*) AS c FROM users WHERE IFNULL(is_virtual,0)=1").get().c;
  const real = db.prepare("SELECT COUNT(*) AS c FROM users WHERE IFNULL(is_virtual,0)=0 AND deleted_at IS NULL").get().c;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const tx = db.transaction(() => {
    for (const { name } of tables) {
      if (name === "users") continue;
      const cols = db.prepare(`PRAGMA table_info(${quote(name)})`).all().map((col) => col.name);
      if (cols.includes("user_id")) {
        db.prepare(
          `DELETE FROM ${quote(name)} WHERE user_id IN (SELECT id FROM users WHERE IFNULL(is_virtual,0)=1)`
        ).run();
      }
      for (const col of cols) {
        if (col === "user_id" || !col.endsWith("user_id")) continue;
        db.prepare(
          `UPDATE ${quote(name)} SET ${quote(col)}=NULL WHERE ${quote(col)} IN (SELECT id FROM users WHERE IFNULL(is_virtual,0)=1)`
        ).run();
      }
    }
    db.prepare("DELETE FROM users WHERE IFNULL(is_virtual,0)=1").run();
  });
  tx();
  const left = db.prepare("SELECT COUNT(*) AS c FROM users WHERE IFNULL(is_virtual,0)=1").get().c;
  const realAfter = db.prepare("SELECT COUNT(*) AS c FROM users WHERE IFNULL(is_virtual,0)=0 AND deleted_at IS NULL").get().c;
  if (realAfter !== real) throw new Error(`真实用户数量变化 ${real} -> ${realAfter}`);
  return { removed: before, left, real };
}

function main() {
  const removed = purge();
  let created = 0;
  while (created < target) {
    createVirtualUser();
    created += 1;
    if (created % 200 === 0) console.log(`已生成 ${created}`);
  }
  const stats = virtualPoolStats();
  console.log(JSON.stringify({ ...removed, created, ...stats }));
}

main();
