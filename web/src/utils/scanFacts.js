export function timeLine(row) {
  if (!row) return "";
  const start = String(row.startDate || row.start_date || "");
  const end = String(row.endDate || row.end_date || "");
  const time = String(row.meetupTime || row.meetup_time || "").trim();
  if (row.channel === "activity") return [start.slice(5), time].filter(Boolean).join(" ");
  const range = end && end !== start ? `${start} 至 ${end}` : start;
  return [range, time].filter(Boolean).join(" ");
}

export function peopleLine(row) {
  if (!row) return "";
  const enrolled = Number(row.enrolled) || 0;
  const max = Number(row.maxSeats || row.max_seats) || 0;
  const remain = Number(row.remain);
  const wait = Number(row.waitlistCount || row.waitlist_count) || 0;
  const activity = row.channel === "activity";
  if (Number.isFinite(remain) && remain <= 0) {
    return wait ? `已满 · 可候补 ${wait} 人` : "已满 · 可候补";
  }
  const left = Number.isFinite(remain) ? remain : Math.max(0, max - enrolled);
  if (activity) {
    return `还缺 ${left} 人 · 已有 ${enrolled}/${max}` + (wait ? ` · 候补 ${wait}` : "");
  }
  const min = row.minGroupSize || row.min_group_size;
  return `已报名 ${enrolled}/${max}` + (min ? `，最低成团 ${min}` : "") + (wait ? ` · 候补 ${wait}` : "");
}

export function trustChips(row) {
  const chips = [];
  if (!row) return chips;
  chips.push(row.organizerType === "company" ? "公司统一支付" : "先报名后付款");
  chips.push("出发日前可取消");
  if (row.channel === "activity") chips.push("到场找发起人");
  else chips.push("山野可加购意外险");
  return chips;
}

export function dockPrice(row) {
  const q = row?.quote || {};
  const origin = Number(q.originPrice ?? q.tripPrice ?? q.price ?? 0);
  const trip = Number(q.tripPrice ?? q.price ?? origin);
  const member = Number(q.memberPrice ?? trip);
  if (origin === 0 && trip === 0) return { free: true, main: "免费", sub: "" };
  if (row?.channel === "activity") return { free: false, main: "¥" + trip, sub: "" };
  return { free: false, main: "¥" + origin, sub: member !== origin ? "会员 ¥" + member : "" };
}

export function enrollCta(row) {
  const remain = Number(row?.remain);
  const activity = row?.channel === "activity";
  if (Number.isFinite(remain) && remain <= 0) return "已满员，去候补";
  return activity ? "报名本局" : "立即报名";
}

export function canShowEnroll(row) {
  if (!row) return false;
  if (row.myEnrollment) return false;
  if (row.status === "cancelled") return false;
  if (row.reviewStatus === "pending" || row.reviewStatus === "rejected") return false;
  return true;
}

export function ticketState(row, query = {}) {
  if (!row) return null;
  const posted = String(query.posted || "") === "1";
  const pending = row.reviewStatus === "pending" || row.review_status === "pending";
  if (pending && (posted || row.isOrganizer)) {
    return {
      kind: "posted",
      title: "已提交审核",
      sub: "通过后会出现在列表里。现在可以先发给朋友预览。",
      share: true,
      trips: false,
    };
  }
  const en = row.myEnrollment;
  if (!en) {
    if (String(query.joined || "") === "1") {
      return {
        kind: "joined",
        title: row.channel === "activity" ? "已报名" : "出行票",
        sub: row.channel === "activity" ? "到场时找发起人即可。" : "到出发日看集合时间和座位。",
        share: true,
        trips: true,
      };
    }
    return null;
  }
  if (en.status === "waitlist") {
    return {
      kind: "waitlist",
      title: "候补票",
      sub: "有人取消后按报名顺序递补，不占座位。",
      share: true,
      trips: true,
    };
  }
  if (en.status === "cancelled") return null;
  return {
    kind: "joined",
    title: row.channel === "activity" ? "已报名" : "出行票",
    sub: row.channel === "activity" ? "到场时找发起人即可。" : "到出发日看集合时间和座位。",
    share: true,
    trips: true,
  };
}
