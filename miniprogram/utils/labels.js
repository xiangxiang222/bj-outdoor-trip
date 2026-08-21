function genderText(gender) {
  if (gender === "male") return "男";
  if (gender === "female") return "女";
  return gender ? "未填" : "";
}

function starText(n) {
  const r = Math.max(0, Math.min(5, Number(n) || 0));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

function enrollStatusText(row) {
  if (row && row.status === "cancelled") {
    return row.pay_status === "refunded" ? "已取消 · 已退款" : "已取消";
  }
  if (row && row.status === "waitlist") return "候补中";
  return payStatusText(row && row.pay_status);
}

function payStatusText(status) {
  return (
    {
      paid: "已支付",
      unpaid: "待支付",
      company_pending: "公司挂账",
      pending: "待支付",
      refunded: "已退款",
    }[status] || status || ""
  );
}

function organizerTypeText(type) {
  return type === "company" ? "公司团" : "个人拼团";
}

function scheduleStatusText(status) {
  return (
    {
      recruiting: "招募中",
      confirmed: "已成团",
      full: "已满员",
      finished: "已结束",
      cancelled: "已解散",
    }[status] || status || ""
  );
}

module.exports = { payStatusText, enrollStatusText, organizerTypeText, scheduleStatusText, starText, genderText };
