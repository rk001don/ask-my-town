import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyRoles } from "@/lib/auth.functions";
import {
  listAllProducts,
  updateProduct,
  createProduct,
  deleteProduct,
  listCategoriesForAdmin,
  createCategory,
  updateCategory,
  listAppConfig,
  updateAppConfig,
  listDeliveryBatches,
  updateBatchStatus,
} from "@/lib/admin.functions";
import { AppHeader } from "@/components/AppHeader";
import { CatalogImageUpload } from "@/components/CatalogImageUpload";
import { toast } from "sonner";
import { to12Hour } from "@/lib/time";
import { Loader2, ShieldAlert, LogOut, Plus, Trash2, Search, ArrowUpDown, X } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — MyTown" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminPage,
});

const BATCH_NEXT_ACTION_LABEL: Record<string, string> = {
  open: "Lock",
  locked: "Mark dispatched",
  dispatched: "Mark delivered",
};

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
      <div>
        <AppHeader title="Admin" showCart={false} showSearch={false} />
        <div className="p-6">
          <div className="skeleton h-40 rounded-2xl" />
        </div>
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
  const createProductFn = useServerFn(createProduct);
  const deleteProductFn = useServerFn(deleteProduct);
  const categoriesFn = useServerFn(listCategoriesForAdmin);
  const createCategoryFn = useServerFn(createCategory);
  const updateCategoryFn = useServerFn(updateCategory);
  const configFn = useServerFn(listAppConfig);
  const updateConfigFn = useServerFn(updateAppConfig);
  const batchesFn = useServerFn(listDeliveryBatches);
  const advanceBatchFn = useServerFn(updateBatchStatus);

  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn(), staleTime: 60_000 });
  const isAdmin = rolesQ.data?.isAdmin ?? false;

  const productsQ = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => productsFn(),
    enabled: isAdmin,
  });
  const categoriesQ = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => categoriesFn(),
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

  // ----- product list: search, category filter, sort -----
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "price" | "category">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);

  const filteredProducts = useMemo(() => {
    let rows = productsQ.data ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (categoryFilter !== "all") {
      rows = rows.filter((p) => p.category_id === categoryFilter);
    }
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "price") cmp = (a.price ?? -1) - (b.price ?? -1);
      else cmp = (a.categories?.name ?? "").localeCompare(b.categories?.name ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [productsQ.data, search, categoryFilter, sortBy, sortDir]);

  function toggleSort(col: "name" | "price" | "category") {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  async function patchProduct(id: string, patch: Record<string, unknown>) {
    try {
      await updateProductFn({ data: { id, ...patch } });
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function addProduct(input: {
    name: string;
    category_id: string;
    price: number | null;
    show_price: boolean;
    is_service: boolean;
    schedulable: boolean;
  }) {
    try {
      await createProductFn({ data: input });
      toast.success("Product added");
      setShowNewProduct(false);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add product");
    }
  }

  async function removeProduct(id: string, name: string) {
    if (
      !window.confirm(
        `Remove "${name}"? It'll stop showing to customers (you can re-enable it later via the Available toggle).`,
      )
    )
      return;
    try {
      await deleteProductFn({ data: { id } });
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove product");
    }
  }

  async function advanceBatch(id: string) {
    try {
      const { newStatus } = await advanceBatchFn({ data: { id } });
      toast.success(`Batch marked ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["admin-batches"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update batch");
    }
  }

  async function addCategory(input: { name: string; parent_id: string | null }) {
    try {
      await createCategoryFn({ data: input });
      toast.success("Category added");
      setShowNewCategory(false);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add category");
    }
  }

  async function patchCategory(id: string, patch: Record<string, unknown>) {
    try {
      await updateCategoryFn({ data: { id, ...patch } });
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
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
    <div className="min-h-[100dvh] px-4 py-5 md:px-8 md:py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-display text-xl font-semibold md:text-2xl">Admin console</div>
        <button
          onClick={() => supabase.auth.signOut().then(() => window.location.assign("/"))}
          className="tap-scale flex items-center gap-1 rounded-full border border-[color:var(--border-strong)] px-3 py-1.5 text-xs font-semibold"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>

      {/* -------------------- Products -------------------- */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Products</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowNewCategory((v) => !v)}
              className="tap-scale flex items-center gap-1 rounded-full border border-[color:var(--border-strong)] px-3 py-1.5 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" /> New category
            </button>
            <button
              onClick={() => setShowNewProduct((v) => !v)}
              className="tap-scale flex items-center gap-1 rounded-full accent-gradient px-3 py-1.5 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" /> New product
            </button>
          </div>
        </div>

        {showNewCategory && (
          <NewCategoryForm
            categories={categoriesQ.data ?? []}
            onCancel={() => setShowNewCategory(false)}
            onSubmit={addCategory}
          />
        )}

        {showNewProduct && (
          <NewProductForm
            categories={categoriesQ.data ?? []}
            onCancel={() => setShowNewProduct(false)}
            onSubmit={addProduct}
          />
        )}

        {/* Search + category filter — works the same on mobile and desktop */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full rounded-full border border-[color:var(--border-strong)] bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-[color:var(--accent-primary)]"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-full border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] px-3 py-2 text-sm"
          >
            <option value="all">All categories</option>
            {(categoriesQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {productsQ.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--border-strong)] p-6 text-center text-sm text-[color:var(--text-tertiary)]">
            No products match that search/filter.
          </div>
        ) : (
          <>
            {/* Desktop: sortable table */}
            <div className="hidden overflow-x-auto rounded-2xl border border-[color:var(--border-subtle)] md:block">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-left text-xs uppercase text-[color:var(--text-tertiary)]">
                  <tr>
                    <th className="p-3">Image</th>
                    <SortableHeader
                      label="Name"
                      col="name"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableHeader
                      label="Category"
                      col="category"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableHeader
                      label="Price (₹)"
                      col="price"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                    <th className="p-3">Show price</th>
                    <th className="p-3">Service</th>
                    <th className="p-3">Schedulable</th>
                    <th className="p-3">Available</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      onPatch={(patch) => patchProduct(p.id, patch)}
                      onDelete={() => removeProduct(p.id, p.name)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked cards, same fields, no forced horizontal scroll */}
            <div className="space-y-2 md:hidden">
              {filteredProducts.map((p) => (
                <ProductCardAdmin
                  key={p.id}
                  product={p}
                  onPatch={(patch) => patchProduct(p.id, patch)}
                  onDelete={() => removeProduct(p.id, p.name)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* -------------------- Categories -------------------- */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Categories</h2>
        {categoriesQ.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-2">
            {(categoriesQ.data ?? []).map((c) => (
              <div key={c.id} className="card-surface flex items-center gap-3 p-3">
                <CatalogImageUpload
                  imageUrl={c.image_url}
                  onUploaded={(url) => patchCategory(c.id, { image_url: url })}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{c.name}</div>
                  <div className="text-xs text-[color:var(--text-tertiary)]">
                    {c.parent_id ? "Subcategory" : "Top-level"}
                  </div>
                </div>
              </div>
            ))}
            {(categoriesQ.data ?? []).length === 0 && (
              <div className="text-sm text-[color:var(--text-tertiary)]">No categories yet.</div>
            )}
          </div>
        )}
      </section>

      {/* -------------------- App config -------------------- */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold">Feature flags / config</h2>
        <p className="mb-3 mt-1 text-xs text-[color:var(--text-secondary)]">
          App-wide settings you can change without a code deploy. Each value is raw JSON — e.g. for
          a list of languages, type <span className="font-mono">["ta","en"]</span> (with the
          brackets and quotes) and press Save.
        </p>
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
        <h2 className="text-lg font-semibold">Delivery batches</h2>
        <p className="mb-3 mt-1 text-xs text-[color:var(--text-secondary)]">
          Orders placed for the same delivery window (e.g. "tomorrow evening") are grouped into one
          batch so a single rider can deliver them together in one trip, instead of a separate trip
          per order. <span className="font-semibold">Open</span> means it's still accepting new
          orders for that window; <span className="font-semibold">locked/dispatched</span> means
          it's on its way.
        </p>
        {batchesQ.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-2">
            {(batchesQ.data ?? []).map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
              >
                <span className="capitalize">
                  {b.scheduled_date} · {b.window_label}
                  {b.scheduled_at && (
                    <span className="ml-1 text-xs text-[color:var(--text-tertiary)]">
                      ({to12Hour(new Date(b.scheduled_at).toTimeString().slice(0, 5))})
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase">
                    {b.status}
                  </span>
                  {BATCH_NEXT_ACTION_LABEL[b.status] && (
                    <button
                      onClick={() => advanceBatch(b.id)}
                      className="tap-scale rounded-full accent-gradient px-2.5 py-1 text-xs font-semibold"
                    >
                      {BATCH_NEXT_ACTION_LABEL[b.status]}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {(batchesQ.data ?? []).length === 0 && (
              <div className="text-sm text-[color:var(--text-tertiary)]">
                No batches yet — one is created automatically the first time an order is placed for
                a given day/window.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SortableHeader({
  label,
  col,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  col: "name" | "price" | "category";
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (col: "name" | "price" | "category") => void;
}) {
  const active = sortBy === col;
  return (
    <th className="p-3">
      <button
        onClick={() => onSort(col)}
        className="tap-scale flex items-center gap-1 font-semibold uppercase tracking-wide"
        style={{ color: active ? "var(--accent-primary)" : undefined }}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
        {active && <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function NewCategoryForm({
  categories,
  onCancel,
  onSubmit,
}: {
  categories: { id: string; name: string; parent_id?: string | null }[];
  onCancel: () => void;
  onSubmit: (input: { name: string; parent_id: string | null }) => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  // Only top-level categories make sensible parents for a new subcategory --
  // keeps this to two levels deep, matching how the storefront navigates.
  const topLevel = categories.filter((c) => !c.parent_id);

  return (
    <div className="glass mb-3 space-y-3 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">New category</div>
        <button onClick={onCancel} className="tap-scale" aria-label="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          className="rounded-lg border border-[color:var(--border-strong)] bg-transparent px-3 py-2 text-sm"
        />
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] px-3 py-2 text-sm"
        >
          <option value="">Top-level category (no parent)</option>
          {topLevel.map((c) => (
            <option key={c.id} value={c.id}>
              Subcategory of {c.name}
            </option>
          ))}
        </select>
      </div>
      <button
        disabled={!name.trim() || saving}
        onClick={async () => {
          setSaving(true);
          await onSubmit({ name: name.trim(), parent_id: parentId || null });
          setSaving(false);
        }}
        className="tap-scale w-full rounded-full accent-gradient py-2 text-sm font-semibold disabled:opacity-50"
      >
        {saving ? "Adding…" : "Add category"}
      </button>
    </div>
  );
}

function NewProductForm({
  categories,
  onCancel,
  onSubmit,
}: {
  categories: { id: string; name: string }[];
  onCancel: () => void;
  onSubmit: (input: {
    name: string;
    category_id: string;
    price: number | null;
    show_price: boolean;
    is_service: boolean;
    schedulable: boolean;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [showPrice, setShowPrice] = useState(true);
  const [isService, setIsService] = useState(false);
  const [schedulable, setSchedulable] = useState(true);
  const [saving, setSaving] = useState(false);

  return (
    <div className="glass mb-3 space-y-3 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">New product</div>
        <button onClick={onCancel} className="tap-scale" aria-label="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name"
          className="rounded-lg border border-[color:var(--border-strong)] bg-transparent px-3 py-2 text-sm"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] px-3 py-2 text-sm"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="Price (₹, optional)"
          inputMode="decimal"
          className="rounded-lg border border-[color:var(--border-strong)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showPrice}
            onChange={(e) => setShowPrice(e.target.checked)}
          />
          Show price
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={isService}
            onChange={(e) => setIsService(e.target.checked)}
          />
          Service (no quantity stepper)
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={schedulable}
            onChange={(e) => setSchedulable(e.target.checked)}
          />
          Schedulable ahead
        </label>
      </div>
      <button
        disabled={!name.trim() || !categoryId || saving}
        onClick={async () => {
          setSaving(true);
          await onSubmit({
            name: name.trim(),
            category_id: categoryId,
            price: price ? Number(price) : null,
            show_price: showPrice,
            is_service: isService,
            schedulable,
          });
          setSaving(false);
        }}
        className="tap-scale w-full rounded-full accent-gradient py-2 text-sm font-semibold disabled:opacity-50"
      >
        {saving ? "Adding…" : "Add product"}
      </button>
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
  image_url?: string | null;
  categories: { name: string } | null;
};

function ProductRow({
  product,
  onPatch,
  onDelete,
}: {
  product: ProductRowData;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [price, setPrice] = useState(product.price != null ? String(product.price) : "");

  return (
    <tr className="border-t border-[color:var(--border-subtle)]">
      <td className="p-3">
        <CatalogImageUpload
          imageUrl={product.image_url}
          onUploaded={(url) => onPatch({ image_url: url })}
          size="h-10 w-10"
        />
      </td>
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
      <td className="p-3">
        <button
          onClick={onDelete}
          className="tap-scale text-[color:var(--danger)]"
          aria-label="Remove product"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

function ProductCardAdmin({
  product,
  onPatch,
  onDelete,
}: {
  product: ProductRowData;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [price, setPrice] = useState(product.price != null ? String(product.price) : "");

  return (
    <div className="card-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <CatalogImageUpload
            imageUrl={product.image_url}
            onUploaded={(url) => onPatch({ image_url: url })}
          />
          <div>
            <div className="text-sm font-semibold">{product.name}</div>
            <div className="text-xs text-[color:var(--text-secondary)]">
              {product.categories?.name ?? "—"}
            </div>
          </div>
        </div>
        <button
          onClick={onDelete}
          className="tap-scale text-[color:var(--danger)]"
          aria-label="Remove product"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-[color:var(--text-tertiary)]">₹</span>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => {
            const num = price === "" ? null : Number(price);
            if (num !== product.price) onPatch({ price: num });
          }}
          className="w-24 rounded-lg border border-[color:var(--border-strong)] bg-transparent px-2 py-1 text-sm"
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            defaultChecked={product.show_price}
            onChange={(e) => onPatch({ show_price: e.target.checked })}
          />
          Show price
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            defaultChecked={product.is_service}
            onChange={(e) => onPatch({ is_service: e.target.checked })}
          />
          Service
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            defaultChecked={product.schedulable}
            onChange={(e) => onPatch({ schedulable: e.target.checked })}
          />
          Schedulable
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            defaultChecked={product.is_available}
            onChange={(e) => onPatch({ is_available: e.target.checked })}
          />
          Available
        </label>
      </div>
    </div>
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
