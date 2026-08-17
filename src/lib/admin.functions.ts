// Admin-only server functions. Requires the 'admin' role specifically —
// ops/warden_viewer must not reach these (catalog/pricing changes are an
// admin-level action, not a general staff one).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { failFrom, userError } from "@/lib/errors";
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
  if (error) throw userError("Failed to verify admin role");
  const isAdmin = (data ?? []).some((r) => r.role === "admin");
  if (!isAdmin) throw userError("Forbidden: admin role required");
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
    if (error) failFrom("admin", error, "That didn't save. Please try again.");
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
        throw userError("Set a price before turning show_price on.");
      }
    }
    const { error } = await supabaseAdmin.from("products").update(patch).eq("id", id);
    if (error) failFrom("admin", error, "That didn't save. Please try again.");
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
    if (error) failFrom("admin", error, "That didn't save. Please try again.");
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
    if (error) failFrom("admin", error, "That didn't save. Please try again.");
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
    if (error) failFrom("admin", error, "That didn't save. Please try again.");
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
    if (error) failFrom("admin", error, "That didn't save. Please try again.");
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
    if (error) failFrom("admin", error, "That didn't save. Please try again.");
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
      throw userError("Set a price before turning show_price on.");
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("products")
      .insert({ ...data, is_available: true })
      .select("id")
      .single();
    if (error) failFrom("admin", error, "That didn't save. Please try again.");
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
    if (error) failFrom("admin", error, "That didn't save. Please try again.");
    await supabaseAdmin.from("audit_log").insert({
      staff_id: context.userId,
      action: "product.delete",
      entity_type: "product",
      entity_id: data.id,
      metadata: {},
    });
    return { ok: true as const };
  });

// Catalog image upload. The bucket is private (public buckets aren't allowed
// on this project), so images are served back through the public read-through
// route at /api/public/catalog-image/$path and image_url stores that path.
const CatalogImageSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z
    .string()
    .trim()
    .regex(/^image\/[a-zA-Z0-9.+-]+$/),
  dataBase64: z.string().min(1).max(9_000_000),
});

export const uploadCatalogImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof CatalogImageSchema>) => CatalogImageSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = Buffer.from(data.dataBase64, "base64");
    if (bytes.byteLength > 5 * 1024 * 1024) throw userError("Image must be under 5MB");
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const { error } = await supabaseAdmin.storage
      .from("catalog-images")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (error) failFrom("admin", error, "That didn't save. Please try again.");
    return { url: `/api/public/catalog-image/${encodeURIComponent(path)}` };
  });

// ---------------------------------------------------------------------------
// Team / access management. Admin-only. Replaces the manual Supabase SQL step
// for granting and revoking staff/admin roles from inside the app.
// ---------------------------------------------------------------------------

const PIN_EMAIL_SUFFIX = "@customers.mytown.internal";
const GRANTABLE_ROLES = ["admin", "ops", "warden_viewer"] as const;

/** Lists every signed-up account with its granted roles, for the admin console. */
export const listUserRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Town-scale: one page of up to 200 accounts is plenty for now. If the
    // user base ever outgrows this, page through with { page, perPage }.
    const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (usersErr) failFrom("admin", usersErr, "That didn't save. Please try again.");
    const { data: roleRows, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) failFrom("admin", rolesErr, "That didn't save. Please try again.");
    const rolesByUser = new Map<string, string[]>();
    for (const r of roleRows ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role);
      rolesByUser.set(r.user_id, list);
    }

    return (usersData.users ?? []).map((u) => {
      const isPin = (u.email ?? "").endsWith(PIN_EMAIL_SUFFIX);
      const phone = isPin ? (u.email ?? "").replace(PIN_EMAIL_SUFFIX, "") : (u.phone ?? null);
      return {
        userId: u.id,
        email: isPin ? null : (u.email ?? null),
        phone,
        isPinAccount: isPin,
        roles: (rolesByUser.get(u.id) ?? []).filter((r) => r !== "customer"),
        createdAt: u.created_at,
      };
    });
  });

const GrantRoleSchema = z.object({
  email: z.string().trim().email().max(200),
  role: z.enum(GRANTABLE_ROLES),
});

/** Grants a role to the account with the given email. */
export const grantUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof GrantRoleSchema>) => GrantRoleSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = data.email.toLowerCase();
    if (email.endsWith(PIN_EMAIL_SUFFIX)) {
      throw userError("Phone + PIN accounts can't be staff. Use a real email or Google account.");
    }

    // Look the account up by email. GoTrue has no direct get-by-email admin
    // call, so scan the first pages of users for the match.
    let matchId: string | null = null;
    for (let page = 1; page <= 5 && !matchId; page++) {
      const { data: usersData, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) failFrom("admin", error, "That didn't save. Please try again.");
      const found = (usersData.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
      if (found) matchId = found.id;
      if ((usersData.users ?? []).length < 200) break;
    }
    if (!matchId) {
      throw userError(
        "No account with that email. They must sign in once before you can grant a role.",
      );
    }

    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: matchId, role: data.role }, { onConflict: "user_id,role" });
    if (insErr) {
      // The DB trigger blocks admin/ops on PIN accounts -- that one is worth
      // explaining, since it's a rule rather than a fault. Anything else is an
      // internal failure and must not be echoed back verbatim.
      if (insErr.message.includes("cannot be granted")) {
        throw userError("That account can't hold staff roles (phone + PIN account).");
      }
      failFrom("admin.grantUserRole", insErr, "Couldn't grant that role. Please try again.");
    }
    return { ok: true as const, userId: matchId };
  });

const RevokeRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(GRANTABLE_ROLES),
});

/** Revokes a role from an account. Guards against an admin locking themselves out. */
export const revokeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof RevokeRoleSchema>) => RevokeRoleSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    if (data.role === "admin" && data.userId === context.userId) {
      throw userError("You can't remove your own admin role — ask another admin to do it.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", data.role);
    if (error) failFrom("admin", error, "That didn't save. Please try again.");
    return { ok: true as const };
  });
