// Read-through image proxy for the private catalog-images bucket.
// Catalog photos are meant to be visible to any visitor, but public storage
// buckets aren't available on this project, so we stream the object here
// behind a long cache header. Read-only: nothing here can write.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/catalog-image/$path")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = decodeURIComponent(params.path);
        if (!/^[a-zA-Z0-9._-]+$/.test(path)) {
          return new Response("Not found", { status: 404 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("catalog-images").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });
        return new Response(await data.arrayBuffer(), {
          headers: {
            "Content-Type": data.type || "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
