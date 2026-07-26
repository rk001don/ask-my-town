import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getServiceFeeConfig } from "@/lib/api.functions";
import { computeServiceFee } from "@/lib/serviceFee";

/**
 * The single place this business model gets explained to the customer.
 * Trust here depends on this being unavoidable to see before paying, not
 * a footnote -- so this renders inline in the cart/checkout flow itself,
 * not behind a "details" toggle.
 */
export function ServiceFeeBreakdown({ subtotal }: { subtotal: number }) {
  const fn = useServerFn(getServiceFeeConfig);
  const { data: config } = useQuery({ queryKey: ["service-fee-config"], queryFn: () => fn() });

  const fee = computeServiceFee(subtotal, config ?? null);
  const total = subtotal + (fee ?? 0);

  return (
    <div className="card-surface space-y-2 p-4 text-sm">
      <Row label="Estimated basket subtotal" value={`₹${subtotal}`} />
      <Row
        label="Service fee"
        value={fee != null ? `₹${fee}` : "Added after pricing is confirmed"}
      />
      {fee != null && (
        <div className="flex items-center justify-between border-t border-[color:var(--border-subtle)] pt-2 font-bold">
          <span>Estimated total</span>
          <span>₹{total}</span>
        </div>
      )}
      <p className="pt-1 text-xs leading-relaxed text-[color:var(--text-tertiary)]">
        We charge a small flat service fee for arranging and delivering your order — it's how MyTown
        stays running, separate from the price of what you're buying.{" "}
        {config && (
          <>
            Under ₹{config.tiers[0]?.max_subtotal ?? 199} → ₹{config.tiers[0]?.fee ?? 19}, up to ₹
            {config.tiers[config.tiers.length - 1]?.max_subtotal ?? 999} → ₹
            {config.tiers[config.tiers.length - 1]?.fee ?? 59}, above that → ₹{config.default_fee}
            .{" "}
          </>
        )}
        Product prices shown are estimates — your final bill is confirmed once we've actually
        purchased your items locally.
      </p>
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
