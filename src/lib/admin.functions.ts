// Admin-only server functions. Requires the 'admin' role specifically —
// ops/warden_viewer must not reach these (catalog/pricing changes are an
// admin-level action, not a general staff one).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

async function assertAdmin(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => Promise<{ data: { role: string }[] | null; error: unknown }>;
      };
    };
  },
  userId: string,
) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error("Failed to verify admin role");
  const isAdmin = (data ?? []).some((r) => r.role === "admin");
  if (!isAdmin) throw new Error("Forbidden: admin role required");
}

const GLOBAL_SCOPE_ID = "00000000-0000-0000-0000-000000000000";

export const listAllProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, category_id, price, show_price, is_service, schedulable, is_available, is_veg, image_url, sort_order, categories(name)",
      )
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const ProductPatchSchema = z.object({
  id: z.string().uuid(),
  price: z.number().min(0).max(100000).nullable().optional(),
  show_price: z.boolean().optional(),
  is_service: z.boolean().optional(),
  schedulable: z.boolean().optional(),
  is_available: z.boolean().optional(),
  image_url: z.string().trim().max(600).nullable().optional(),
});

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof ProductPatchSchema>) => ProductPatchSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    // Guard the same invariant the DB CHECK enforces, so the error is friendly.
    if (patch.show_price === true) {
      const { data: current } = await supabaseAdmin
        .from("products")
        .select("price")
        .eq("id", id)
        .maybeSingle();
      const effectivePrice = patch.price ?? current?.price ?? null;
      if (effectivePrice === null) {
        throw new Error("Set a price before turning show_price on.");
      }
    }
    const { error } = await supabaseAdmin.from("products").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      staff_id: context.userId,
      action: "product.update",
      entity_type: "product",
      entity_id: id,
      metadata: patch,
    });
    return { ok: true as const };
  });

export const listAppConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("key, scope, scope_id, value, description")
      .order("key", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { key: string; value: Json }) =>
    z
      .object({ key: z.string().trim().min(1).max(100), value: z.unknown() as z.ZodType<Json> })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_config").upsert(
      {
        key: data.key,
        scope: "global",
        scope_id: GLOBAL_SCOPE_ID,
        value: data.value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key,scope,scope_id" },
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      staff_id: context.userId,
      action: "config.update",
      entity_type: "app_config",
      entity_id: data.key,
      metadata: { value: data.value },
    });
    return { ok: true as const };
  });

const CategoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  parent_id: z.string().uuid().nullable().optional(),
  icon_key: z.string().trim().max(60).nullable().optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof CategoryCreateSchema>) => CategoryCreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let slug = slugify(data.name);
    // Guard against an accidental duplicate slug rather than a raw DB error.
    const { data: existing } = await supabaseAdmin
      .from("categories")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: inserted, error } = await supabaseAdmin
      .from("categories")
      .insert({
        name: data.name,
        slug,
        parent_id: data.parent_id ?? null,
        icon_key: data.icon_key || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      staff_id: context.userId,
      action: "category.create",
      entity_type: "category",
      entity_id: inserted!.id,
      metadata: { name: data.name, slug, parent_id: data.parent_id ?? null },
    });
    return { id: inserted!.id, slug };
  });

const CategoryPatchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(80).optional(),
  image_url: z.string().trim().max(600).nullable().optional(),
});

export const updateCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof CategoryPatchSchema>) => CategoryPatchSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin.from("categories").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      staff_id: context.userId,
      action: "category.update",
      entity_type: "category",
      entity_id: id,
      metadata: patch,
    });
    return { ok: true as const };
  });

export const listCategoriesForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("categories")
      .select("id, name, slug, parent_id, image_url")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const ProductCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category_id: z.string().uuid(),
  price: z.number().min(0).max(100000).nullable().optional(),
  show_price: z.boolean().default(true),
  is_service: z.boolean().default(false),
  schedulable: z.boolean().default(true),
  is_veg: z.boolean().nullable().optional(),
});

export const createProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof ProductCreateSchema>) => ProductCreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.show_price && data.price == null) {
      throw new Error("Set a price before turning show_price on.");
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("products")
      .insert({ ...data, is_available: true })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      staff_id: context.userId,
      action: "product.create",
      entity_type: "product",
      entity_id: inserted!.id,
      metadata: data,
    });
    return { id: inserted!.id };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Soft-delete: keep is_available=false rather than a hard DELETE, so past
    // orders that reference this product_id don't lose their history.
    const { error } = await supabaseAdmin
      .from("products")
      .update({ is_available: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      staff_id: context.userId,
      action: "product.delete",
      entity_type: "product",
      entity_id: data.id,
      metadata: {},
    });
    return { ok: true as const };
  });

export const listDeliveryBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("delivery_batches")
      .select("id, location_id, window_label, scheduled_date, scheduled_at, status")
      .order("scheduled_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Only the one valid next step from each status is exposed in the UI, so
// there's no dropdown of arbitrary statuses to pick wrong.
const BATCH_NEXT_STATUS: Record<string, string> = {
  open: "locked",
  locked: "dispatched",
  dispatched: "delivered",
};

export const updateBatchStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: batch, error: fetchErr } = await supabaseAdmin
      .from("delivery_batches")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!batch) throw new Error("Batch not found");
    const next = BATCH_NEXT_STATUS[batch.status];
    if (!next) throw new Error(`No further action for a batch that's already "${batch.status}".`);
    const { error } = await supabaseAdmin
      .from("delivery_batches")
      .update({ status: next })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      staff_id: context.userId,
      action: "batch.status_update",
      entity_type: "delivery_batch",
      entity_id: data.id,
      metadata: { from: batch.status, to: next },
    });
    return { newStatus: next };
  });
