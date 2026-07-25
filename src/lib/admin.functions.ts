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
        "id, name, category_id, price, show_price, is_service, schedulable, is_available, is_veg, sort_order, categories(name)",
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

export const listCategoriesForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("categories")
      .select("id, name, slug")
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
