import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Info, X } from "lucide-react";
import { getServiceFeeConfig } from "@/lib/api.functions";
import { computeServiceFee } from "@/lib/serviceFee";

/**
 * Minimal by design: two lines (subtotal, fee) and a total. The "why" and
 * the tier table live behind the (i) icon, not inline — trust here comes
 * from the number being honest and easy to find, not from a paragraph of
 * text nobody reads.
 */
export function ServiceFeeBreakdown({ subtotal }: { subtotal: number }) {
  const fn = useServerFn(getServiceFeeConfig);
  const { data: config } = useQuery({ queryKey: ["service-fee-config"], queryFn: () => fn() });
  const [showInfo, setShowInfo] = useState(false);

  const fee = computeServiceFee(subtotal, config ?? null);
  const total = subtotal + (fee ?? 0);

  return (
    <div className="card-surface space-y-1.5 p-4 text-sm">
      <Row label="Items" value={`₹${subtotal}`} />
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowInfo(true)}
          className="tap-scale flex items-center gap-1 text-[color:var(--text-secondary)]"
        >
          Service fee
          <Info className="h-3.5 w-3.5" />
        </button>
        <span className="font-semibold">{fee != null ? `₹${fee}` : "Added after pricing"}</span>
      </div>
      {fee != null && (
        <div className="flex items-center justify-between border-t border-[color:var(--border-subtle)] pt-1.5 font-bold">
          <span>Total</span>
          <span>₹{total}</span>
        </div>
      )}

      {showInfo &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
            onClick={() => setShowInfo(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="glass max-h-[85dvh] w-full max-w-[420px] overflow-y-auto rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold">How the service fee works</div>
                <button onClick={() => setShowInfo(false)} className="tap-scale" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-xs text-[color:var(--text-secondary)]">
                A flat fee for arranging and delivering your order, based on your basket size —
                separate from what you're buying. Product prices are estimates; your final bill is
                confirmed once we've actually purchased your items.
              </p>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[color:var(--text-tertiary)]">
                    <th className="pb-1.5 font-medium">Basket total</th>
                    <th className="pb-1.5 text-right font-medium">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {(config?.tiers ?? []).map((tier, i, arr) => (
                    <tr
                      key={tier.max_subtotal}
                      className="border-t border-[color:var(--border-subtle)]"
                    >
                      <td className="py-1.5">
                        {i === 0
                          ? `Under ₹${tier.max_subtotal}`
                          : `₹${arr[i - 1].max_subtotal}–₹${tier.max_subtotal}`}
                      </td>
                      <td className="py-1.5 text-right font-semibold">₹{tier.fee}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-[color:var(--border-subtle)]">
                    <td className="py-1.5">
                      Above ₹{config?.tiers[config.tiers.length - 1]?.max_subtotal ?? 999}
                    </td>
                    <td className="py-1.5 text-right font-semibold">
                      ₹{config?.default_fee ?? 99}
                    </td>
                  </tr>
                </tbody>
              </table>
              <button
                onClick={() => setShowInfo(false)}
                className="tap-scale mt-4 w-full rounded-full border border-[color:var(--border-strong)] py-2.5 text-sm font-semibold"
              >
                Got it
              </button>
            </div>
          </div>,
          document.body,
        )}

    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[color:var(--text-secondary)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

/** Compact version for a sticky action bar — same fee, same data, no explainer text. */
export function StickyFeeSummary({
  priceableItems,
  itemsSubtotal,
  totalItemCount,
}: {
  priceableItems: unknown[];
  itemsSubtotal: number;
  totalItemCount: number;
}) {
  const fn = useServerFn(getServiceFeeConfig);
  const { data: config } = useQuery({ queryKey: ["service-fee-config"], queryFn: () => fn() });
  if (priceableItems.length === 0) return null;
  const fee = computeServiceFee(itemsSubtotal, config ?? null);
  const total = itemsSubtotal + (fee ?? 0);
  return (
    <div className="mb-2 flex items-center justify-between text-sm">
      <span className="text-[color:var(--text-secondary)]">
        Total{fee != null ? " (incl. service fee)" : ""}
        {priceableItems.length < totalItemCount ? " · excl. items priced on request" : ""}
      </span>
      <span className="font-bold">₹{total}</span>
    </div>
  );
}
