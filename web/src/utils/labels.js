export function genderText(gender) {
  if (gender === "male") return "男";
  if (gender === "female") return "女";
  return gender ? "未填" : "";
}

export function enrollStatusText(row) {
  if (row?.status === "cancelled") {
    return row.pay_status === "refunded" ? "已取消 · 已退款" : "已取消";
  }
  if (row?.status === "waitlist") return "候补中";
  return payStatusText(row?.pay_status);
}

export function payStatusText(status) {
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

export function organizerTypeText(type, short = false) {
  if (type === "company") return short ? "公司" : "公司团";
  return short ? "个人" : "个人拼团";
}

export function scheduleStatusText(status) {
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
