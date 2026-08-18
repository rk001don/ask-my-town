import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { clearCart, useCart } from "@/lib/cart-store";
import { createOrder, getLocations } from "@/lib/api.functions";
import { getMyProfile, linkCustomerToMe } from "@/lib/auth.functions";
import { rememberGuestOrder } from "@/lib/guest-orders";
import { isValidIndianPhone, normalizeIndianPhone } from "@/lib/phone";
import { formatTimeRange12h } from "@/lib/time";
import { ServiceFeeBreakdown, StickyFeeSummary } from "@/components/ServiceFeeBreakdown";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { toUserMessage } from "@/lib/errors";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Your details — MyTown" }] }),
  component: Checkout,
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
});

const RECENT_KEY = "mytown.customer.v1";

type DeliveryWindow = { label: string; start: string; end: string; cutoff: string };

function nowInTz(tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    h: parseInt(parts.hour, 10) % 24,
    m: parseInt(parts.minute, 10),
  };
}
function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function prettyDate(iso: string, tz: string): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: tz,
  });
}

function Checkout() {
  const { items } = useCart();
  const navigate = useNavigate();
  const submit = useServerFn(createOrder);
  const fetchLocations = useServerFn(getLocations);

  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: () => fetchLocations(),
    staleTime: 5 * 60 * 1000,
  });
  const location = locations?.[0];
  const tz = location?.timezone || "Asia/Kolkata";
  const windows: DeliveryWindow[] =
    (location?.config as { delivery_windows?: DeliveryWindow[] } | undefined)?.delivery_windows ??
    [];
  const priceableItems = items.filter((i) => i.showPrice && i.unitPrice != null);
  const itemsSubtotal = priceableItems.reduce((n, i) => n + (i.unitPrice ?? 0) * i.quantity, 0);

  type CheckoutForm = {
    name: string;
    phone: string;
    address: string;
    landmark: string;
    pincode: string;
    notes: string;
  };
  const initial: CheckoutForm = (() => {
    if (typeof window === "undefined")
      return { name: "", phone: "", address: "", landmark: "", pincode: "", notes: "" };
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) return { notes: "", ...JSON.parse(raw) };
    } catch {
      /* localStorage unavailable (private browsing, quota) -- fall through to blank form */
    }
    return { name: "", phone: "", address: "", landmark: "", pincode: "", notes: "" };
  })();

  const [form, setForm] = useState<CheckoutForm>(initial);
  // Fields the customer has edited here. The profile prefill below must never
  // overwrite something they are in the middle of correcting.
  const touchedRef = useRef<Set<keyof CheckoutForm>>(new Set());
  function update(field: keyof CheckoutForm, value: string) {
    touchedRef.current.add(field);
    setForm((f) => ({ ...f, [field]: value }));
  }
  const [busy, setBusy] = useState(false);
  // For a signed-in customer the account is the truth, not this device's last
  // typed values. Reading only localStorage meant the checkout form and the
  // account's own "Your details" could show two different names and addresses
  // for the same person -- which is exactly what it looked like.
  //
  // Only fills blanks: anything already typed in this session wins, so this
  // can never overwrite what someone is in the middle of correcting.
  const profileFn = useServerFn(getMyProfile);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session || cancelled) return;
      try {
        const profile = await profileFn();
        if (!profile || cancelled) return;
        setForm((f) => {
          const next = { ...f };
          // For a signed-in customer the account is the ONLY source of these
          // fields -- not just the winner over this device's remembered
          // values, but the sole source. An untouched field is set to the
          // profile's value OR EMPTY, never left holding the localStorage
          // value.
          //
          // The "or empty" is the important half. localStorage (RECENT_KEY)
          // holds whoever checked out last on this browser. On a shared phone
          // -- common here; the identity bug came from two people on one
          // number -- a signed-in customer whose own profile is still blank
          // would otherwise see the previous person's name prefilled, and
          // submitting would write that name onto their own row. Blank profile
          // must mean a blank form, so they type their own details fresh.
          //
          // Fields edited this session (touchedRef) always win, so this can
          // never overwrite something being corrected in the moment.
          const t = touchedRef.current;
          if (!t.has("name")) next.name = profile.name ?? "";
          if (!t.has("phone")) next.phone = profile.phone ?? "";
          if (!t.has("address")) next.address = profile.address ?? "";
          if (!t.has("landmark")) next.landmark = profile.landmark ?? "";
          if (!t.has("pincode")) next.pincode = profile.pincode ?? "";
          return next;
        });
      } catch {
        /* profile is a convenience here; the form still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileFn]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // One key per checkout attempt (stable across re-renders, fresh on remount)
  // -- lets a genuine network-retry of the same submit land on the same
  // order server-side instead of creating a duplicate, without affecting the
  // existing double-click guard (`busy`), which already stops a second tap.
  const idempotencyKeyRef = useRef<string | null>(null);
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID();

  // Scheduling state
  const [mode, setMode] = useState<"asap" | "schedule">("asap");
  const nowTz = useMemo(() => nowInTz(tz), [tz]);
  const dateOptions = useMemo(() => {
    const today = nowTz.dateStr;
    return [
      { iso: today, label: `Today, ${prettyDate(today, tz)}` },
      { iso: addDaysISO(today, 1), label: `Tomorrow, ${prettyDate(addDaysISO(today, 1), tz)}` },
      { iso: addDaysISO(today, 2), label: prettyDate(addDaysISO(today, 2), tz) },
    ];
  }, [nowTz.dateStr, tz]);
  const [dateIso, setDateIso] = useState<string>(dateOptions[0].iso);
  const [windowLabel, setWindowLabel] = useState<string | null>(null);

  const isToday = dateIso === nowTz.dateStr;

  function windowClosedToday(w: DeliveryWindow): boolean {
    if (!isToday) return false;
    const [h, m] = w.cutoff.split(":").map((n) => parseInt(n, 10));
    const cutMin = h * 60 + (m || 0);
    return nowTz.h * 60 + nowTz.m >= cutMin;
  }

  if (items.length === 0) {
    return (
      <div>
        <AppHeader title="Your details" />
        <EmptyState
          title="Nothing to send yet"
          message="Your ask is empty. Browse or tell us what you need first."
        />
      </div>
    );
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = "Please enter your name";
    if (!isValidIndianPhone(form.phone.trim())) errs.phone = "Enter a valid 10-digit mobile number";
    if (form.address.trim().length < 6) errs.address = "Please add a delivery address";
    if (mode === "schedule" && !windowLabel) errs.window = "Pick a delivery window";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      const res = await submit({
        data: {
          customer: {
            name: form.name.trim(),
            phone: form.phone.trim(),
            address: form.address.trim(),
            landmark: form.landmark?.trim() || undefined,
            pincode: form.pincode?.trim() || undefined,
          },
          items: items.map((i) => ({
            productId: i.productId,
            itemName: i.itemName,
            category: i.category,
            subcategory: i.subcategory,
            quantity: i.quantity,
            notes: i.notes || undefined,
            isFreeform: i.isFreeform,
            attachmentPath: i.attachmentPath,
          })),
          notes: form.notes?.trim() || undefined,
          locationId: location?.id,
          idempotencyKey: idempotencyKeyRef.current ?? undefined,
          ...(mode === "schedule"
            ? { requestedDate: dateIso, requestedWindow: windowLabel ?? undefined }
            : {}),
        },
      });
      try {
        localStorage.setItem(
          RECENT_KEY,
          JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim(),
            address: form.address.trim(),
            landmark: form.landmark?.trim() ?? "",
            pincode: form.pincode?.trim() ?? "",
          }),
        );
      } catch {
        /* localStorage unavailable (private browsing, quota) -- non-fatal, order already placed */
      }
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session) {
          await linkCustomerToMe({ data: { orderId: res.orderId } });
        } else {
          // Placed as a guest: remember the ID on this device so that signing
          // in later attaches this order automatically, with no phone matching
          // and nothing for the customer to type. SessionSync does the claim.
          rememberGuestOrder(res.orderId);
        }
      } catch {
        /* non-fatal -- the order exists either way, and can still be claimed
           by ID from the account screen */
      }
      // `replace` so the finished checkout drops out of history. Without it
      // the stack was /cart -> /checkout -> /order, and backing out of the
      // order landed on a checkout whose cart had just been emptied, which
      // bounced to /cart -- pressing back again just repeated the bounce.
      await navigate({
        to: "/order/$orderId",
        params: { orderId: res.orderId },
        // `placed` tells the order page to send "back" home rather than to the
        // now-empty cart just below it in history. Every other entry point
        // (Orders list, shared link) omits it and gets natural back.
        search: { placed: true },
        replace: true,
      });
      // Clear only after we've actually left this page -- clearing first made
      // checkout's own "cart is empty" state flash for a frame before the
      // route transition finished, since items.length dropped to 0 while
      // still mounted here.
      clearCart();
    } catch (err) {
      const msg = toUserMessage(err, "Couldn't send your ask. Please try again.");
      toast.error(msg);
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AppHeader title="Your details" showCart={false} />
      <form onSubmit={onSubmit} className="rise space-y-4 p-4 pb-40">
        <div>
          <h2 className="text-display text-xl font-semibold">Where do we bring it?</h2>
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
            We'll call or WhatsApp you to confirm before doing anything.
          </p>
        </div>

        {priceableItems.length > 0 && <ServiceFeeBreakdown subtotal={itemsSubtotal} />}

        {/* Schedule toggle */}
        <div>
          <div className="mb-1.5 text-sm font-semibold">When to deliver</div>
          <div
            role="tablist"
            aria-label="Delivery timing"
            className="inline-flex w-full rounded-full border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "asap"}
              onClick={() => {
                setMode("asap");
                setWindowLabel(null);
                setDateIso(dateOptions[0].iso);
              }}
              className={`tap-scale flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
                mode === "asap" ? "accent-gradient" : "text-[color:var(--text-secondary)]"
              }`}
            >
              Deliver Now
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "schedule"}
              onClick={() => setMode("schedule")}
              className={`tap-scale flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
                mode === "schedule" ? "accent-gradient" : "text-[color:var(--text-secondary)]"
              }`}
            >
              Schedule
            </button>
          </div>

          {mode === "schedule" && (
            <div className="mt-3 space-y-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] p-3">
              <div>
                <div className="mb-1.5 text-xs font-semibold text-[color:var(--text-secondary)]">
                  Choose a day
                </div>
                <div className="flex flex-wrap gap-2">
                  {dateOptions.map((d) => (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => setDateIso(d.iso)}
                      className={`tap-scale rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        dateIso === d.iso
                          ? "accent-gradient border-transparent"
                          : "border-[color:var(--border-strong)] text-[color:var(--text-primary)] bg-[color:var(--bg-elevated-2)]"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold text-[color:var(--text-secondary)]">
                  Choose a window
                </div>
                <div className="flex flex-wrap gap-2">
                  {windows.length === 0 && (
                    <span className="text-xs text-[color:var(--text-muted)]">Loading windows…</span>
                  )}
                  {windows.map((w) => {
                    const closed = windowClosedToday(w);
                    const active = windowLabel === w.label;
                    return (
                      <button
                        key={w.label}
                        type="button"
                        disabled={closed}
                        onClick={() => setWindowLabel(w.label)}
                        className={`min-h-11 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${closed ? "" : "tap-scale"} ${
                          active
                            ? "accent-gradient border-transparent"
                            : closed
                              ? "border-[color:var(--border-subtle)] bg-transparent text-[color:var(--text-muted)] opacity-60 cursor-not-allowed"
                              : "border-[color:var(--border-strong)] text-[color:var(--text-primary)] bg-[color:var(--bg-elevated-2)]"
                        }`}
                        title={closed ? "Closed for today" : formatTimeRange12h(w.start, w.end)}
                      >
                        {w.label}
                        <span className="ml-1.5 text-xs opacity-70">
                          {closed ? "closed" : formatTimeRange12h(w.start, w.end)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {errors.window && (
                  <div className="mt-1 text-xs text-[color:var(--danger)]">{errors.window}</div>
                )}
              </div>
            </div>
          )}
        </div>

        <Field label="Your name" error={errors.name}>
          <input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            autoComplete="name"
            className="mt-input"
            placeholder="e.g. Priya R."
          />
        </Field>

        <Field label="Phone number" error={errors.phone}>
          <div className="mt-input flex items-center gap-2 !px-0">
            <span className="border-r border-[color:var(--border-strong)] px-3 text-[15px] font-semibold text-[color:var(--text-secondary)]">
              +91
            </span>
            <input
              value={form.phone}
              // normalizeIndianPhone already strips +91/91/0 and separators, and the
              // server validates with the same helper. Doing it here too means a
              // pasted "+91 98765 43210" lands as the right ten digits instead of
              // keeping the country code and dropping the last two.
              onChange={(e) =>
                update(
                  "phone",
                  normalizeIndianPhone(e.target.value).replace(/\D/g, "").slice(0, 10),
                )
              }
              autoComplete="tel"
              inputMode="numeric"
              className="w-full bg-transparent pr-3 outline-none"
              placeholder="10-digit mobile"
            />
          </div>
        </Field>

        <Field label="Delivery address" error={errors.address}>
          <textarea
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            autoComplete="street-address"
            rows={3}
            className="mt-input"
            placeholder="Door no., street, area"
          />
        </Field>

        <Field label="Landmark" hint="Optional">
          <input
            value={form.landmark}
            onChange={(e) => update("landmark", e.target.value)}
            className="mt-input"
            placeholder="Near the temple, opposite school…"
          />
        </Field>

        {/* Optional, and stays optional. A pincode is what makes an address
            machine-readable -- it is what a serviceability check and a second
            town will both key off -- but demanding one from someone who
            doesn't know theirs would cost orders today for a benefit that
            arrives later. */}
        <Field label="Pincode" hint="Optional" error={errors.pincode}>
          <input
            value={form.pincode}
            onChange={(e) => update("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoComplete="postal-code"
            inputMode="numeric"
            className="mt-input"
            placeholder="6-digit pincode"
          />
        </Field>

        <Field label="Anything else" hint="Optional">
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="mt-input"
            placeholder="Special instructions"
            maxLength={500}
          />
        </Field>

        <style>{`
          .mt-input {
            width: 100%;
            border-radius: 14px;
            border: 1px solid var(--border-strong);
            background: var(--bg-elevated-2);
            padding: 12px 14px;
            font-size: 15px;
            color: var(--text-primary);
          }
          .mt-input:focus { outline: none; border-color: var(--accent-primary); }
          .mt-input::placeholder { color: var(--text-muted); }
        `}</style>

        <div
          className="glass fixed inset-x-0 bottom-0 z-[var(--z-header)] border-t border-[color:var(--border-subtle)] p-4 md:left-56"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto w-full max-w-[520px] md:max-w-2xl">
            <StickyFeeSummary
              priceableItems={priceableItems}
              itemsSubtotal={itemsSubtotal}
              totalItemCount={items.length}
            />
            <button
              type="submit"
              disabled={busy}
              className="tap-scale flex w-full items-center justify-center gap-2 rounded-full accent-gradient py-3.5 text-[15px] font-bold disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Sending…" : `Send my ask (${items.reduce((n, i) => n + i.quantity, 0)})`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-semibold">{label}</span>
        {hint && <span className="text-xs text-[color:var(--text-muted)]">{hint}</span>}
      </div>
      {children}
      {error && <div className="mt-1 text-xs text-[color:var(--danger)]">{error}</div>}
    </label>
  );
}
