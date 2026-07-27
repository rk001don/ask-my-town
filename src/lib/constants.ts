export const TOWN_NAME = "Karimangalam";
export const WHATSAPP_NUMBER = "918072283367"; // wa.me format, no +
export const WHATSAPP_DEFAULT_MSG = "Hi MyTown, I need help with something.";
export const APP_NAME = "MyTown";
export const APP_TAGLINE = "Need Anything? MyTown!";
export const APP_SUBTEXT = "Serving Karimangalam & nearby areas — just tell us what you need.";

export function waLink(text = WHATSAPP_DEFAULT_MSG) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export const ORDER_STATUS_STEPS = [
  { key: "received", label: "Received" },
  { key: "confirmed", label: "Confirmed" },
  { key: "arranging", label: "Arranging" },
  { key: "on_the_way", label: "On the way" },
  { key: "completed", label: "Completed" },
] as const;

export type OrderStatus = (typeof ORDER_STATUS_STEPS)[number]["key"] | "cancelled";

export const STATUS_COPY: Record<OrderStatus, { label: string; blurb: string }> = {
  received: { label: "Received", blurb: "We got your ask — our team is on it." },
  confirmed: { label: "Confirmed", blurb: "Confirmed. We're arranging it now." },
  arranging: { label: "Arranging", blurb: "Getting your items ready." },
  on_the_way: { label: "On the way", blurb: "Heading to your address." },
  completed: { label: "Completed", blurb: "Delivered. Anything else?" },
  cancelled: { label: "Cancelled", blurb: "This order was cancelled." },
};
