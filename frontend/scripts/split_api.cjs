// T7 机械拆分 api/index.ts -> 按域文件，保证 100% 导出一致、零改名。
const fs = require("fs");
const path = require("path");

const apiDir = path.join(__dirname, "..", "src", "api");
const src = fs.readFileSync(path.join(apiDir, "index.ts"), "utf8");

// 1) 提取所有类型定义（interface / type），生成 types.ts
const typeRe = /export\s+(interface|type)\s+[\w<>, ]+\s*\{[\s\S]*?\n\}|export\s+type\s+[\w<>, ]+\s*=[^;]*;/g;
const typeMatches = [...src.matchAll(typeRe)].map((m) => m[0]);
const typeNames = typeMatches
  .map((t) => (t.match(/export\s+(?:interface|type)\s+(\w+)/) || [])[1])
  .filter(Boolean);
const typesFile =
  "// T7：api 公共类型集中定义（由 split_api 脚本从 index.ts 提取，勿手改）。\n\n" +
  typeMatches.join("\n\n") + "\n";

// 2) 找出所有段注释位置，并把第一个段之前的内容作为 preamble
const segRe = /\/\/ -{3,}\s*(.+?)\s*-{3,}/g;
const segments = [];
let m;
while ((m = segRe.exec(src))) {
  segments.push({ title: m[1].trim(), index: m.index, end: segRe.lastIndex });
}
segments.forEach((s, i) => (s.end = i + 1 < segments.length ? segments[i + 1].index : src.length));
const preamble = src.slice(0, segments.length ? segments[0].index : src.length);

function domainOf(title) {
  const t = title;
  if (/认证/.test(t)) return "auth";
  if (/首页运营内容|AI营销|AI首页编排|选品洞察|报表导出PDF|报表导出/.test(t)) return "marketing";
  if (/买家中心|积分商城|收藏|通知|积分|PLUS|会员等级|通知分类|地址智能解析|浏览历史|关注流动态/.test(t)) return "user";
  if (/商品|分类|评价增强|商品问答|商品多规格|历史价格曲线|AI比价|库存管理|评价管理|售后进度时间轴/.test(t)) return "products";
  if (/购物车/.test(t)) return "cart";
  if (/订单|退货物流|退货退款|换货|仲裁|部分退款|支付|电子发票|预售定金/.test(t)) return "orders";
  if (/店铺|店铺装修|关注店铺/.test(t)) return "shop";
  if (/售后工单/.test(t)) return "support";
  if (/管理员|审计回放|商家深度分析/.test(t)) return "admin";
  if (/种草笔记/.test(t)) return "note";
  if (/分销裂变/.test(t)) return "affiliate";
  if (/直播带货/.test(t)) return "live";
  if (/搜索增强|分面检索|搜索联想/.test(t)) return "search";
  if (/AI客服|AI可行动代理层|P3-B/.test(t)) return "agent";
  if (/商家|报表定时邮件|上传/.test(t)) return "merchant";
  if (/个性化推荐/.test(t)) return "recommend";
  return "misc";
}

const domains = {};
for (const seg of segments) {
  const key = domainOf(seg.title);
  if (!domains[key]) domains[key] = { blocks: [] };
  domains[key].blocks.push(src.slice(seg.index, seg.end));
}

// 3) 生成每个域文件（剥离类型，保留函数 + 段注释）
const typeStripRe = new RegExp(typeRe.source, "g");

/** 按 body 实际出现的标识符裁剪 import，避免生成大量 no-unused-vars 警告。 */
function buildHeader(body) {
  // 去掉注释后再判断标识符是否真正被代码使用，避免注释中的词造成误判。
  const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const used = (name) => new RegExp(`\\b${name}\\b`).test(code);
  const valueImports = ["api", "API_BASE"].filter(used);
  const usedTypes = typeNames.filter(used);
  let out = "// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。\n";
  if (valueImports.length) {
    out += `import { ${valueImports.join(", ")} } from "./client";\n`;
  }
  if (usedTypes.length) {
    out += `import type { ${usedTypes.join(", ")} } from "./types";\n`;
  }
  return out + "\n";
}

const bodies = {};
for (const [key, dom] of Object.entries(domains)) {
  if (key === "recommend") continue;
  bodies[key] = dom.blocks.join("\n").replace(typeStripRe, "").trim();
}

// 把 preamble 中的函数（proxyImg 等，去掉 import 行）并入 misc.ts
const preambleFns = preamble
  .split("\n")
  .filter((l) => !/^import\s/.test(l.trim()))
  .join("\n")
  .replace(typeStripRe, "")
  .trim();
if (preambleFns) {
  bodies.misc = (bodies.misc ? bodies.misc + "\n" : "") + preambleFns;
}

const files = {};
for (const [key, body] of Object.entries(bodies)) {
  files[key] = buildHeader(body) + body + "\n";
}

// 4) 写文件
fs.writeFileSync(path.join(apiDir, "types.ts"), typesFile);
for (const [key, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(apiDir, `${key}.ts`), content);
}

// 5) 生成聚合 index.ts（无条件导出全部）
const aggOrder = [
  "types", "client", "auth", "marketing", "user", "products", "cart",
  "orders", "shop", "support", "admin", "note", "affiliate", "live",
  "search", "agent", "merchant", "misc", "recommend",
];
const aggLines = [
  "// T7：api 按域拆分后的聚合入口（由 split_api 脚本生成）。",
  '// 所有业务函数已拆分到各域文件，本文件仅做 re-export，',
  '// 保证原有 `import { ... } from "../api"` / `"@/api"` 的调用方零改动。',
  "",
];
for (const k of aggOrder) {
  aggLines.push(`export * from "./${k}";`);
}
fs.writeFileSync(path.join(apiDir, "index.ts"), aggLines.join("\n") + "\n");

console.log("domains:", Object.keys(files).join(", "));
console.log("type count:", typeNames.length);
console.log("preamble functions included:", preambleFns ? "yes" : "no");
