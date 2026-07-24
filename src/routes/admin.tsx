import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyRoles } from "@/lib/auth.functions";
import {
  listAllProducts,
  updateProduct,
  listAppConfig,
  updateAppConfig,
  listDeliveryBatches,
} from "@/lib/admin.functions";
import { AppHeader } from "@/components/AppHeader";
import { toast } from "sonner";
import { Loader2, ShieldAlert, LogOut } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — MyTown" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div className="p-6">
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    );
  }
  if (!email) {
    return (
      <div>
        <AppHeader title="Admin" showCart={false} showSearch={false} />
        <div className="mx-auto max-w-sm px-5 pt-6 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-[color:var(--warning)]" />
          <h2 className="mt-3 text-display text-xl font-semibold">Sign in required</h2>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
            Sign in with your staff account at <span className="font-mono">/auth</span> first.
          </p>
        </div>
      </div>
    );
  }
  return <AdminBoard email={email} />;
}

function AdminBoard({ email }: { email: string }) {
  const qc = useQueryClient();
  const rolesFn = useServerFn(getMyRoles);
  const productsFn = useServerFn(listAllProducts);
  const updateProductFn = useServerFn(updateProduct);
  const configFn = useServerFn(listAppConfig);
  const updateConfigFn = useServerFn(updateAppConfig);
  const batchesFn = useServerFn(listDeliveryBatches);

  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn(), staleTime: 60_000 });
  const isAdmin = rolesQ.data?.isAdmin ?? false;

  const productsQ = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => productsFn(),
    enabled: isAdmin,
  });
  const configQ = useQuery({
    queryKey: ["admin-config"],
    queryFn: () => configFn(),
    enabled: isAdmin,
  });
  const batchesQ = useQuery({
    queryKey: ["admin-batches"],
    queryFn: () => batchesFn(),
    enabled: isAdmin,
  });

  async function patchProduct(id: string, patch: Record<string, unknown>) {
    try {
      await updateProductFn({ data: { id, ...patch } });
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function saveConfig(key: string, raw: string) {
    try {
      const value = JSON.parse(raw);
      await updateConfigFn({ data: { key, value } });
      toast.success("Config saved");
      qc.invalidateQueries({ queryKey: ["admin-config"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid JSON or save failed");
    }
  }

  if (rolesQ.isLoading) {
    return (
      <div className="p-6">
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div>
        <AppHeader title="Admin" showCart={false} showSearch={false} />
        <div className="mx-auto max-w-sm px-5 pt-6 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-[color:var(--warning)]" />
          <h2 className="mt-3 text-display text-xl font-semibold">Admin access required</h2>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
            Signed in as <span className="font-mono">{email}</span>, but this account isn't an
            admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] px-4 py-6 md:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="text-display text-2xl font-semibold">Admin console</div>
        <button
          onClick={() => supabase.auth.signOut().then(() => window.location.assign("/"))}
          className="tap-scale flex items-center gap-1 rounded-full border border-[color:var(--border-strong)] px-3 py-1.5 text-xs font-semibold"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>

      {/* -------------------- Products -------------------- */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Products</h2>
        {productsQ.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[color:var(--border-subtle)]">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase text-[color:var(--text-tertiary)]">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Price (₹)</th>
                  <th className="p-3">Show price</th>
                  <th className="p-3">Service</th>
                  <th className="p-3">Schedulable</th>
                  <th className="p-3">Available</th>
                </tr>
              </thead>
              <tbody>
                {(productsQ.data ?? []).map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    onPatch={(patch) => patchProduct(p.id, patch)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* -------------------- App config -------------------- */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Feature flags / config</h2>
        {configQ.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-3">
            {(configQ.data ?? []).map((c) => (
              <ConfigRow
                key={`${c.key}:${c.scope}:${c.scope_id}`}
                configKey={c.key}
                description={c.description}
                value={c.value}
                onSave={(raw) => saveConfig(c.key, raw)}
              />
            ))}
          </div>
        )}
      </section>

      {/* -------------------- Delivery batches -------------------- */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Delivery batches</h2>
        {batchesQ.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-2">
            {(batchesQ.data ?? []).map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm"
              >
                <span className="capitalize">
                  {b.scheduled_date} · {b.window_label}
                </span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase">
                  {b.status}
                </span>
              </div>
            ))}
            {(batchesQ.data ?? []).length === 0 && (
              <div className="text-sm text-[color:var(--text-tertiary)]">No batches yet.</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

type ProductRowData = {
  id: string;
  name: string;
  price: number | null;
  show_price: boolean;
  is_service: boolean;
  schedulable: boolean;
  is_available: boolean;
  categories: { name: string } | null;
};

function ProductRow({
  product,
  onPatch,
}: {
  product: ProductRowData;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const [price, setPrice] = useState(product.price != null ? String(product.price) : "");

  return (
    <tr className="border-t border-[color:var(--border-subtle)]">
      <td className="p-3 font-medium">{product.name}</td>
      <td className="p-3 text-[color:var(--text-secondary)]">{product.categories?.name ?? "—"}</td>
      <td className="p-3">
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => {
            const num = price === "" ? null : Number(price);
            if (num !== product.price) onPatch({ price: num });
          }}
          className="w-20 rounded-lg border border-[color:var(--border-strong)] bg-transparent px-2 py-1"
        />
      </td>
      <td className="p-3">
        <input
          type="checkbox"
          defaultChecked={product.show_price}
          onChange={(e) => onPatch({ show_price: e.target.checked })}
        />
      </td>
      <td className="p-3">
        <input
          type="checkbox"
          defaultChecked={product.is_service}
          onChange={(e) => onPatch({ is_service: e.target.checked })}
        />
      </td>
      <td className="p-3">
        <input
          type="checkbox"
          defaultChecked={product.schedulable}
          onChange={(e) => onPatch({ schedulable: e.target.checked })}
        />
      </td>
      <td className="p-3">
        <input
          type="checkbox"
          defaultChecked={product.is_available}
          onChange={(e) => onPatch({ is_available: e.target.checked })}
        />
      </td>
    </tr>
  );
}

function ConfigRow({
  configKey,
  description,
  value,
  onSave,
}: {
  configKey: string;
  description: string | null;
  value: unknown;
  onSave: (raw: string) => void;
}) {
  const [raw, setRaw] = useState(JSON.stringify(value));
  return (
    <div className="glass rounded-2xl p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-sm font-semibold">{configKey}</div>
          {description && (
            <div className="text-xs text-[color:var(--text-tertiary)]">{description}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="w-40 rounded-lg border border-[color:var(--border-strong)] bg-transparent px-2 py-1 font-mono text-xs"
          />
          <button
            onClick={() => onSave(raw)}
            className="tap-scale rounded-full accent-gradient px-3 py-1.5 text-xs font-semibold"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
