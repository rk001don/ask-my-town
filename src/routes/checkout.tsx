import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState } from "@/components/States";
import { clearCart, useCart } from "@/lib/cart-store";
import { createOrder, getLocations } from "@/lib/api.functions";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type DeliveryWindow = { label: string; start: string; end: string; cutoff?: string };

/** Next 3 calendar days (today, tomorrow, day-after) — matches the 2-day-ahead schedule limit. */
function nextThreeDays() {
  return Array.from({ length: 3 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      value: d.toISOString().slice(0, 10),
      label:
        i === 0
          ? "Today"
          : i === 1
            ? "Tomorrow"
            : d.toLocaleDateString("en-IN", { weekday: "short" }),
      dateLabel: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    };
  });
}

function windowIsClosedToday(win: DeliveryWindow, dateValue: string, todayValue: string) {
  if (dateValue !== todayValue || !win.cutoff) return false;
  const nowTime = new Date().toTimeString().slice(0, 5);
  return nowTime >= win.cutoff;
}

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Your details — MyTown" }] }),
  component: Checkout,
});

const RECENT_KEY = "mytown.customer.v1";

function Checkout() {
  const { items } = useCart();
  const navigate = useNavigate();
  const submit = useServerFn(createOrder);

  const initial = (() => {
    if (typeof window === "undefined")
      return { name: "", phone: "", address: "", landmark: "", notes: "" };
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) return { notes: "", ...JSON.parse(raw) };
    } catch {}
    return { name: "", phone: "", address: "", landmark: "", notes: "" };
  })();

  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ----- Schedule Order (optional, collapsed by default — "ASAP" is untouched behavior) -----
  const [scheduleMode, setScheduleMode] = useState<"asap" | "schedule">("asap");
  const days = useMemo(() => nextThreeDays(), []);
  const todayValue = days[0].value;
  const [scheduleDate, setScheduleDate] = useState<string | null>(todayValue);
  const [scheduleWindow, setScheduleWindow] = useState<string | null>(null);

  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: () => getLocations() });
  const activeLocation = locations?.[0];
  const windows: DeliveryWindow[] =
    (activeLocation?.config as { delivery_windows?: DeliveryWindow[] } | undefined)
      ?.delivery_windows ?? [];

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
    if (!/^[+]?[0-9\s-]{7,15}$/.test(form.phone.trim())) errs.phone = "Enter a valid phone number";
    if (form.address.trim().length < 6) errs.address = "Please add a delivery address";
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
          },
          items: items.map((i) => ({
            itemName: i.itemName,
            category: i.category,
            subcategory: i.subcategory,
            quantity: i.quantity,
            notes: i.notes || undefined,
            isFreeform: i.isFreeform,
          })),
          notes: form.notes?.trim() || undefined,
          locationId: activeLocation?.id,
          // Untouched "Deliver ASAP" path sends neither field — server behaves exactly as before.
          ...(scheduleMode === "schedule" && scheduleDate
            ? { requestedDate: scheduleDate, requestedWindow: scheduleWindow ?? undefined }
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
          }),
        );
      } catch {}
      clearCart();
      navigate({ to: "/order/$orderId", params: { orderId: res.orderId } });
    } catch (err) {
      toast.error("Couldn't send your ask. Please try again.");
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
            We'll confirm on WhatsApp before doing anything.
          </p>
        </div>

        {/* Deliver ASAP / Schedule — collapsed by default, zero extra steps unless opted into */}
        <div>
          <div className="grid grid-cols-2 gap-1 rounded-full border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] p-1">
            {(["asap", "schedule"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setScheduleMode(mode)}
                className="tap-scale rounded-full py-2 text-sm font-semibold transition-colors"
                style={
                  scheduleMode === mode
                    ? {
                        background:
                          "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
                      }
                    : { color: "var(--text-secondary)" }
                }
              >
                {mode === "asap" ? "Deliver ASAP" : "Schedule"}
              </button>
            ))}
          </div>

          {scheduleMode === "schedule" && (
            <div className="rise mt-3 space-y-3">
              <div>
                <div className="mb-1.5 text-sm font-semibold">Choose a day</div>
                <div className="flex gap-2">
                  {days.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setScheduleDate(d.value)}
                      className="tap-scale flex-1 rounded-2xl border py-2 text-center text-xs font-semibold"
                      style={{
                        borderColor:
                          scheduleDate === d.value
                            ? "var(--accent-primary)"
                            : "var(--border-strong)",
                        background:
                          scheduleDate === d.value ? "var(--bg-elevated-2)" : "transparent",
                      }}
                    >
                      <div>{d.label}</div>
                      <div className="text-[10px] font-normal text-[color:var(--text-muted)]">
                        {d.dateLabel}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {windows.length > 0 && (
                <div>
                  <div className="mb-1.5 text-sm font-semibold">Choose a window</div>
                  <div className="flex flex-wrap gap-2">
                    {windows.map((w) => {
                      const closed = scheduleDate
                        ? windowIsClosedToday(w, scheduleDate, todayValue)
                        : false;
                      return (
                        <button
                          key={w.label}
                          type="button"
                          disabled={closed}
                          onClick={() => setScheduleWindow(w.label)}
                          className="tap-scale rounded-full border px-4 py-2 text-xs font-semibold capitalize disabled:opacity-40"
                          style={{
                            borderColor:
                              scheduleWindow === w.label
                                ? "var(--accent-primary)"
                                : "var(--border-strong)",
                          }}
                        >
                          {w.label}
                          {closed && <span className="ml-1 font-normal">· closed</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <Field label="Your name" error={errors.name}>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoComplete="name"
            className="mt-input"
            placeholder="e.g. Priya R."
          />
        </Field>

        <Field label="Phone number" error={errors.phone}>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            autoComplete="tel"
            inputMode="tel"
            className="mt-input"
            placeholder="10-digit mobile"
          />
        </Field>

        <Field label="Delivery address" error={errors.address}>
          <textarea
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            autoComplete="street-address"
            rows={3}
            className="mt-input"
            placeholder="Door no., street, area"
          />
        </Field>

        <Field label="Landmark" hint="Optional">
          <input
            value={form.landmark}
            onChange={(e) => setForm({ ...form, landmark: e.target.value })}
            className="mt-input"
            placeholder="Near the temple, opposite school…"
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
          className="glass fixed bottom-0 left-1/2 z-30 w-full max-w-[520px] -translate-x-1/2 border-t border-[color:var(--border-subtle)] p-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <button
            type="submit"
            disabled={busy}
            className="tap-scale flex w-full items-center justify-center gap-2 rounded-full accent-gradient py-3.5 text-[15px] font-bold disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Sending…" : `Send my ask (${items.reduce((n, i) => n + i.quantity, 0)})`}
          </button>
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
