// T6: ESLint 兜底，拦截"静默吞错"与无脑 console。
// 不引入 typescript-eslint 的 recommended 全家桶（会误伤大量存量代码/Service Worker/未装的 react-hooks 插件），
// 仅启用与审计强相关的几条宽松规则。
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      // Service Worker 等运行在浏览器全局上下文的脚本，self/caches/fetch 均为合法运行时全局
      "public/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
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
