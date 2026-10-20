const dayjs = require("dayjs");
const { getDb } = require("../db");
const { addPoints } = require("./helpers");

const REWARDS = [2, 2, 5, 5, 8, 8, 20];

function rewardForStreak(streak) {
  const n = Math.max(1, Number(streak) || 1);
  return REWARDS[(n - 1) % REWARDS.length];
}

function dayKey(offset = 0) {
  return dayjs().add(offset, "day").format("YYYY-MM-DD");
}

function rowOn(userId, day) {
  return getDb().prepare("SELECT * FROM user_signins WHERE user_id=? AND day=?").get(userId, day);
}

function signedToday(userId) {
  return Boolean(rowOn(userId, dayKey(0)));
}

function state(userId) {
  const todayRow = rowOn(userId, dayKey(0));
  const yRow = rowOn(userId, dayKey(-1));
  const streak = todayRow ? todayRow.streak : yRow ? yRow.streak : 0;
  const nextStreak = todayRow ? todayRow.streak : streak + 1;
  const user = getDb().prepare("SELECT points FROM users WHERE id=?").get(userId);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = dayjs().add(i, "day");
    const streakForDay = (todayRow ? todayRow.streak : nextStreak) + i;
    days.push({
      day: date.format("YYYY-MM-DD"),
      label: i === 0 ? "今天" : date.format("M.D"),
      points: i === 0 && todayRow ? todayRow.points : rewardForStreak(streakForDay),
      signed: i === 0 ? Boolean(todayRow) : false,
      today: i === 0,
    });
  }
  return {
    signedToday: Boolean(todayRow),
    streak,
    todayPoints: todayRow ? todayRow.points : rewardForStreak(nextStreak),
    points: Number(user?.points || 0),
    days,
    gained: 0,
    already: Boolean(todayRow),
  };
}

function signIn(userId) {
  const today = dayKey(0);
  if (rowOn(userId, today)) return { ...state(userId), already: true, gained: 0 };
  const prev = rowOn(userId, dayKey(-1));
  const streak = (prev?.streak || 0) + 1;
  const points = rewardForStreak(streak);
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare("INSERT INTO user_signins (user_id, day, streak, points) VALUES (?,?,?,?)").run(userId, today, streak, points);
    addPoints(userId, points, "每日签到", "signin", streak);
  });
  try {
    run();
  } catch (err) {
    if (String(err && err.message).includes("UNIQUE")) return { ...state(userId), already: true, gained: 0 };
    throw err;
  }
  return { ...state(userId), already: false, gained: points };
}

module.exports = { signIn, state, signedToday, rewardForStreak };
