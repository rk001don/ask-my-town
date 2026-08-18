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

/**
 * A timestamp (order placed, campaign sent, ...) for a person to read: "17
 * Aug, 2:45 PM". Two things `.toLocaleString()` alone gets wrong for this
 * app specifically:
 *
 * - No `timeZone` pinned means it renders in whatever the environment
 *   defaults to -- UTC on the server, the visitor's own device locale on the
 *   client -- which can silently disagree (a hydration mismatch) and, near
 *   midnight IST, can show the wrong calendar day entirely.
 * - No `hour12` pinned means the hour format follows the browser's locale
 *   default, which for many locales is 24-hour -- not what this app's one
 *   town expects to read.
 *
 * No "IST" suffix: this app serves a single Indian town, so the timezone is
 * never ambiguous and doesn't need spelling out on every timestamp.
 */
export function formatOrderTimestamp(iso: string): string {
  // Built from parts, not `.toLocaleString()`'s own assembled string:
  // Node's ICU renders "am"/"pm" lowercase for en-IN, while a browser
  // typically renders it uppercase. Trusting that would mean the server-
  // rendered HTML and the client's first render can disagree on casing for
  // the exact same instant -- a hydration mismatch, not just a style
  // inconsistency. Assembling explicitly removes that risk entirely.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ${parts.dayPeriod.toUpperCase()}`;
}
