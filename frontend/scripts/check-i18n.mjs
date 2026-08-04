// @ts-nocheck
/**
 * i18n 缺失 key 扫描器
 * ----------------------------------------------------------------
 * 扫描 src 下所有 .ts/.tsx 中通过 t("key") / translate("key") 引用的 key，
 * 对比 src/i18n/zh.ts 与 src/i18n/en.ts 的扁平 key 表，列出缺失项。
 *
 * 目的：防止新增文案时漏写 i18n key（否则线上会显示原始 key 字符串）。
 * 在 CI 与 Render 构建阶段运行，任一语言包缺 key 即非零退出。
 *
 * 用法：node scripts/check-i18n.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..", "src");

/** 递归收集 src 下所有 .ts/.tsx（排除 node_modules/dist） */
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".git", "dist", "tests"].includes(e.name)) continue;
      walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

/** 提取源码中通过 t("x") / translate("x") 引用的静态 key（跳过含 ${} 的动态拼接） */
function extractUsedKeys(files) {
  const used = new Set();
  const re = /(?:^|[^.\w])(?:t|translate)\(\s*(["'`])([a-zA-Z0-9_.\-]+)\1\s*\)/g;
  for (const f of files) {
    const txt = fs.readFileSync(f, "utf8");
    let m;
    while ((m = re.exec(txt))) used.add(m[2]);
  }
  return used;
}

/** 从语言包文件提取扁平 key 集合（匹配行首 `key:` 或 `"key":` 或 `'key':`） */
function extractLangKeys(file) {
  const txt = fs.readFileSync(file, "utf8");
  const keys = new Set();
  const re = /^\s*["'`]?([a-zA-Z0-9_.\-]+)["'`]?\s*:/gm;
  let m;
  while ((m = re.exec(txt))) keys.add(m[1]);
  return keys;
}

const files = walk(SRC);
const used = extractUsedKeys(files);
const zhKeys = extractLangKeys(path.join(SRC, "i18n", "zh.ts"));
const enKeys = extractLangKeys(path.join(SRC, "i18n", "en.ts"));

const missingZh = [...used].filter((k) => !zhKeys.has(k)).sort();
const missingEn = [...used].filter((k) => !enKeys.has(k)).sort();
const onlyZh = [...zhKeys].filter((k) => !enKeys.has(k)).sort();
const onlyEn = [...enKeys].filter((k) => !zhKeys.has(k)).sort();

const fail = missingZh.length || missingEn.length || onlyZh.length || onlyEn.length;

console.log(`[check:i18n] 扫描源文件 ${files.length} 个，使用 key ${used.size} 个`);
console.log(`[check:i18n] zh 包 ${zhKeys.size} 键，en 包 ${enKeys.size} 键`);

if (!fail) {
  console.log("[check:i18n] ✅ 中英文 key 双向对齐，无缺失。");
  process.exit(0);
}

if (missingZh.length) {
  console.error(`\n❌ 缺失于 zh.ts（代码引用但未定义）：`);
  console.error(missingZh.map((k) => `   - ${k}`).join("\n"));
}
if (missingEn.length) {
  console.error(`\n❌ 缺失于 en.ts（代码引用但未定义）：`);
  console.error(missingEn.map((k) => `   - ${k}`).join("\n"));
}
if (onlyZh.length) {
  console.error(`\n⚠️ 仅存在于 zh.ts（en.ts 未定义）：`);
  console.error(onlyZh.map((k) => `   - ${k}`).join("\n"));
}
if (onlyEn.length) {
  console.error(`\n⚠️ 仅存在于 en.ts（zh.ts 未定义）：`);
  console.error(onlyEn.map((k) => `   - ${k}`).join("\n"));
}
console.error("\n[check:i18n] 失败：请补齐上述语言包 key 后重试。");
process.exit(1);
