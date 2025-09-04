import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.mts", "**/*.cts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ["tsconfig.json", "packages/*/tsconfig.json"],
        tsconfigRootDir: process.cwd(),
        sourceType: "module",
      },
      globals: {
        console: true,
        process: true,
        NodeJS: true,
        Buffer: true,
        setTimeout: true,
        clearTimeout: true,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Strict TS rules
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-shadow": "error",
      eqeqeq: ["error", "smart"],
      "no-implicit-coercion": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    ignores: [
      "**/dist/**",
      "node_modules",
      "eslint.config.mjs",
      "vitest.config.ts",
      "testdata/golden/**",
    ],
  },
];
