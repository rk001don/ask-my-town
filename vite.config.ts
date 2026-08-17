import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig(async ({ command }) => {
  const plugins = [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
  ];

  // Nitro only participates in the production build — `vite dev` serves
  // TanStack Start directly. Deploy target is Vercel (not Lovable's Cloudflare default).
  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({ preset: "vercel" }));
  }

  plugins.push(viteReact());

  return {
    plugins,
    build: {
      rollupOptions: {
        output: {
          // Supabase's client is ~300 kB and is imported statically by four
          // routes (auth, activity, admin, staff), which is enough for Rollup
          // to hoist it into the chunk EVERY visitor downloads -- including
          // someone browsing the menu who never signs in.
          //
          // Forcing it into its own chunk means it's fetched only by the
          // routes that actually need it. On the mobile connections this app
          // is used on, that's the single largest saving available.
          manualChunks(id: string) {
            if (id.includes("node_modules/@supabase/")) return "supabase";
          },
        },
      },
    },
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
  };
});
