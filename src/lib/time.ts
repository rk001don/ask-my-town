/** "17:00" -> "5:00 PM". Used everywhere a stored 24-hour "HH:MM" string
 * (delivery windows, cutoffs) needs to be shown to a person rather than
 * a system. */
export function to12Hour(hhmm: string): string {
  const [hStr, mStr = "00"] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr.padStart(2, "0")} ${period}`;
}

export function formatTimeRange12h(start: string, end: string): string {
  return `${to12Hour(start)} – ${to12Hour(end)}`;
}
