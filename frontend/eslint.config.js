// T6: ESLint 兜底，拦截"静默吞错"与无脑 console。
// 配置保持宽松（其余规则默认 off），只启用与审计强相关的几条，避免误伤现有大量代码。
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "playwright-report/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // 禁止空函数体：避免 `.catch(() => {})` 这类吞掉异常（配合 reportError/swallow 使用）
      "no-empty-function": "error",
      // 禁止裸 console（构建已 drop，但源码层面仍应走 reportError / 显式 warn）
      "no-console": ["warn", { allow: ["warn", "error", "debug"] }],
      // 未使用变量（含 catch 形参）强制处理
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
