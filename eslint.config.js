import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module"
      }
    },
    rules: {
      // Ja wolę jawne zamiast "any"
      "@typescript-eslint/no-explicit-any": "error"
    }
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**"]
  }
];
