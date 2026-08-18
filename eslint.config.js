import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Generated files: build output, the router tree, and the Supabase types
  // are all machine-produced — linting/formatting them is pure noise.
  //
  // `.claude` matters more than it looks. ESLint's flat config does NOT read
  // .gitignore, so a directory being untracked is not enough to keep it out of
  // the lint. That directory holds agent worktrees -- full copies of this repo
  // -- and had grown to 930 MB and 607 .ts/.tsx files, which made `npm run
  // lint` appear to hang. CI never saw it, because it is not in git.
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      ".vercel",
      ".claude",
      "test-results",
      "playwright-report",
      "src/routeTree.gen.ts",
      "src/integrations/supabase/types.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
