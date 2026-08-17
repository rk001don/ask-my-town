export const TOWN_NAME = "Karimangalam";
export const WHATSAPP_NUMBER = "918072283367"; // wa.me format, no +

/** Human-readable form of the same number, for use inside message copy. */
export const SUPPORT_PHONE_DISPLAY = "+91 80722 83367";
export const WHATSAPP_DEFAULT_MSG = "Hi MyTown, I need help with something.";
export const APP_NAME = "MyTown";
export const APP_TAGLINE = "Need Anything? MyTown!";
export const APP_SUBTEXT = "Serving Karimangalam & nearby areas — just tell us what you need.";

export function waLink(text = WHATSAPP_DEFAULT_MSG) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

// Static estimate shown once an order is confirmed -- not a live ETA (no
// dispatch/route data feeds this), just a realistic expectation for a
// single-town delivery radius.
export const DELIVERY_ETA_LABEL = "Est. delivery: ~15–30 min";

// Internal/staff-facing step order -- includes every operational status,
// including "arranging" which staff actively use to track kitchen/prep work.
// Do not use this for customer-facing screens; see CUSTOMER_ORDER_STEPS below.
export const ORDER_STATUS_STEPS = [
  { key: "received", label: "Received" },
  { key: "confirmed", label: "Confirmed" },
  { key: "arranging", label: "Preparing" },
  { key: "on_the_way", label: "Out for delivery" },
  { key: "completed", label: "Delivered" },
] as const;

export type OrderStatus = (typeof ORDER_STATUS_STEPS)[number]["key"] | "cancelled";

export const STATUS_COPY: Record<OrderStatus, { label: string; blurb: string }> = {
  received: { label: "Received", blurb: "We got your ask — our team is on it." },
  confirmed: { label: "Confirmed", blurb: "Confirmed. We're preparing it now." },
  arranging: { label: "Preparing", blurb: "Getting your items ready." },
  on_the_way: { label: "Out for delivery", blurb: "Heading to your address." },
  completed: { label: "Delivered", blurb: "Delivered. Anything else?" },
  cancelled: { label: "Cancelled", blurb: "This order was cancelled." },
};

// Push-notification titles per status. Deliberately distinct from the terse
// board labels above: a notification is read on a lock screen with no other
// context, so it names the milestone in full ("Out for delivery", not just
// "Out for delivery" column). Keeps every push scannable at a glance instead
// of five identical "MyTown order update" lines stacking up.
export const STATUS_PUSH_TITLE: Record<OrderStatus, string> = {
  received: "Order received",
  confirmed: "Order confirmed",
  arranging: "Preparing your order",
  on_the_way: "Out for delivery",
  completed: "Order delivered",
  cancelled: "Order cancelled",
};

// Customer-facing lifecycle is intentionally simpler than the internal one:
// Received -> Confirmed -> Out for delivery -> Delivered. The internal
// "arranging" (prep) status is real and still drives the staff board, but a
// customer should never see it as a distinct step -- it reads as still
// "Confirmed" to them (their order is confirmed and being worked on).
export const CUSTOMER_ORDER_STEPS = [
  { key: "received", label: "Received" },
  { key: "confirmed", label: "Confirmed" },
  { key: "on_the_way", label: "Out for delivery" },
  { key: "completed", label: "Delivered" },
] as const;

export function customerFacingStatus(status: OrderStatus): OrderStatus {
  return status === "arranging" ? "confirmed" : status;
}
