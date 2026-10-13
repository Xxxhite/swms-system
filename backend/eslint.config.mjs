import js from "@eslint/js"
import prettier from "eslint-config-prettier"
import globals from "globals"
import tseslint from "typescript-eslint"

export default [
  { ignores: ["node_modules/**", "drizzle/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.mjs"],
    languageOptions: { globals: { ...globals.node, Bun: "readonly" } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  prettier,
]
