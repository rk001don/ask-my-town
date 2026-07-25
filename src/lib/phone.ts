/**
 * Indian mobile numbers: 10 digits, first digit 6-9 (the actual numbering
 * plan range for mobiles). Accepts optional +91/91/0 prefixes on input and
 * always normalizes to the bare 10-digit form for storage/lookup, since
 * that's what's stored in `customers.phone` -- a form that sometimes has
 * +91 and sometimes doesn't would silently fail to match on lookup.
 */
const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

/** Strip spaces/dashes/+91/91/0 prefix down to a bare 10-digit string. */
export function normalizeIndianPhone(raw: string): string {
  let digits = raw.replace(/[\s-]/g, "").replace(/^\+?91/, "");
  digits = digits.replace(/^0+/, "");
  return digits;
}

export function isValidIndianPhone(raw: string): boolean {
  return INDIAN_MOBILE_RE.test(normalizeIndianPhone(raw));
}

/** For display only, e.g. the order-tracking page: "+91 96882 67792". */
export function displayIndianPhone(raw: string): string {
  const n = normalizeIndianPhone(raw);
  if (!INDIAN_MOBILE_RE.test(n)) return raw;
  return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
}
