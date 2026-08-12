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
