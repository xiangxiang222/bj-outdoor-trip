export function isHistoricalGuideTrip(trip, today) {
  if (trip.completedAt || trip.status === "cancelled") return true;
  // A multi-day trip or a started trip still needs the guide's attention.
  if (trip.startedAt) return false;
  return String(trip.endDate || trip.startDate || "").slice(0, 10) < today;
}

export function guideCheckedIn(person, hasOpenSession) {
  return hasOpenSession ? Boolean(person.sessionChecked) : Boolean(person.checkinAt);
}

export function filterGuideRoster(roster, { query = "", state = "all", hasOpenSession = false } = {}) {
  const term = String(query).trim().toLowerCase();
  return (roster || []).filter((person) => {
    const fields = [person.name, person.seatNo, String(person.phone || "").slice(-4), person.emergencyName];
    if (term && !fields.some((value) => String(value || "").toLowerCase().includes(term))) return false;
    const checked = guideCheckedIn(person, hasOpenSession);
    if (state === "checked") return checked;
    if (state === "unchecked") return !checked;
    return true;
  });
}
