function encodeShareScene(opts) {
  const id = opts && opts.id;
  const ref = opts && opts.ref;
  const bits = ["i" + id];
  const code = String(ref || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  if (code) bits.push("r" + code);
  return bits.join(".").slice(0, 32);
}

function decodeShareScene(scene) {
  const out = { id: "", ref: "", joinCode: "" };
  String(scene || "").split(".").forEach((part) => {
    if (part.indexOf("i") === 0) out.id = part.slice(1);
    else if (part.indexOf("r") === 0) out.ref = part.slice(1);
    else if (part.indexOf("c") === 0) out.joinCode = part.slice(1);
  });
  return out;
}

function persistRef(scheduleId, ref) {
  const code = String(ref || "").trim();
  if (!scheduleId || !code) return code;
  try {
    wx.setStorageSync("share_ref_" + scheduleId, code);
  } catch (e) {
    /* ignore */
  }
  return code;
}

function readRef(scheduleId) {
  try {
    return wx.getStorageSync("share_ref_" + scheduleId) || "";
  } catch (e) {
    return "";
  }
}

function enrollQuery(page, extra) {
  const bits = ["id=" + page.data.id];
  if (page.data.ref) bits.push("ref=" + encodeURIComponent(page.data.ref));
  if (page.data.coupon) bits.push("coupon=" + encodeURIComponent(page.data.coupon));
  const code = (page.data.s && page.data.s.joinCode) || page.data.inboundJoinCode;
  if (code) bits.push("joinCode=" + encodeURIComponent(code));
  if (extra) bits.push(extra);
  return bits.join("&");
}

module.exports = { encodeShareScene, decodeShareScene, persistRef, readRef, enrollQuery };
