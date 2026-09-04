const config = require("../config");

function catalog() {
  return (config.supplies && config.supplies.items) || [];
}

function resolveSupplies(list) {
  const items = [];
  for (const row of Array.isArray(list) ? list : []) {
    const item = catalog().find((p) => p.code === row.code);
    const qty = Math.min(10, Math.max(0, Number(row.qty) || 0));
    if (!item || !qty) continue;
    const exist = items.find((p) => p.code === item.code);
    if (exist) {
      exist.qty = Math.min(10, exist.qty + qty);
      exist.fee = exist.qty * item.fee;
    } else {
      items.push({ code: item.code, name: item.name, qty, unitFee: item.fee, fee: qty * item.fee });
    }
  }
  return {
    items,
    fee: items.reduce((sum, p) => sum + p.fee, 0),
  };
}

module.exports = { catalog, resolveSupplies };
