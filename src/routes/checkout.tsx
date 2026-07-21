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

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Your details — MyTown" }] }),
  component: Checkout,
});

const RECENT_KEY = "mytown.customer.v1";

type DeliveryWindow = { label: string; start: string; end: string; cutoff: string };

function nowInTz(tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
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
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: tz });
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
    ((location?.config as { delivery_windows?: DeliveryWindow[] } | undefined)?.delivery_windows) ?? [];

  const initial = (() => {
    if (typeof window === "undefined") return { name: "", phone: "", address: "", landmark: "", notes: "" };
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) return { notes: "", ...JSON.parse(raw) };
    } catch {}
    return { name: "", phone: "", address: "", landmark: "", notes: "" };
  })();

  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    if (!/^[+]?[0-9\s-]{7,15}$/.test(form.phone.trim())) errs.phone = "Enter a valid phone number";
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
          locationId: location?.id,
          ...(mode === "schedule"
            ? { requestedDate: dateIso, requestedWindow: windowLabel ?? undefined }
            : {}),
        },
      });
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify({
          name: form.name.trim(), phone: form.phone.trim(),
          address: form.address.trim(), landmark: form.landmark?.trim() ?? "",
        }));
      } catch {}
      clearCart();
      navigate({ to: "/order/$orderId", params: { orderId: res.orderId } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't send your ask. Please try again.";
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
            We'll confirm on WhatsApp before doing anything.
          </p>
        </div>

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
              onClick={() => { setMode("asap"); setWindowLabel(null); setDateIso(dateOptions[0].iso); }}
              className={`flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
                mode === "asap" ? "accent-gradient text-black" : "text-[color:var(--text-secondary)]"
              }`}
            >
              Deliver ASAP
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "schedule"}
              onClick={() => setMode("schedule")}
              className={`flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
                mode === "schedule" ? "accent-gradient text-black" : "text-[color:var(--text-secondary)]"
              }`}
            >
              Schedule
            </button>
          </div>

          {mode === "schedule" && (
            <div className="mt-3 space-y-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated-1)] p-3">
              <div>
                <div className="mb-1.5 text-xs font-semibold text-[color:var(--text-secondary)]">Choose a day</div>
                <div className="flex flex-wrap gap-2">
                  {dateOptions.map((d) => (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => setDateIso(d.iso)}
                      className={`rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                        dateIso === d.iso
                          ? "accent-gradient text-black border-transparent"
                          : "border-[color:var(--border-strong)] text-[color:var(--text-primary)] bg-[color:var(--bg-elevated-2)]"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold text-[color:var(--text-secondary)]">Choose a window</div>
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
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                          active
                            ? "accent-gradient text-black border-transparent"
                            : closed
                            ? "border-[color:var(--border-subtle)] bg-transparent text-[color:var(--text-muted)] opacity-60 cursor-not-allowed"
                            : "border-[color:var(--border-strong)] text-[color:var(--text-primary)] bg-[color:var(--bg-elevated-2)]"
                        }`}
                        title={closed ? "Closed for today" : `${w.start}–${w.end}`}
                      >
                        {w.label}
                        <span className="ml-1.5 text-xs opacity-70">
                          {closed ? "closed" : `${w.start}–${w.end}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {errors.window && <div className="mt-1 text-xs text-[color:var(--danger)]">{errors.window}</div>}
              </div>
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
  label, hint, error, children,
}: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
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
