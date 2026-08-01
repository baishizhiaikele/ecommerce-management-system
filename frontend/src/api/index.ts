// T7：api 按域拆分后的聚合入口（由 split_api 脚本生成）。
// 所有业务函数已拆分到各域文件，本文件仅做 re-export，
// 保证原有 `import { ... } from "../api"` / `"@/api"` 的调用方零改动。

export * from "./types";
export * from "./client";
export * from "./auth";
export * from "./marketing";
export * from "./user";
export * from "./products";
export * from "./cart";
export * from "./orders";
export * from "./shop";
export * from "./support";
export * from "./admin";
export * from "./note";
export * from "./affiliate";
export * from "./live";
export * from "./search";
export * from "./agent";
export * from "./merchant";
export * from "./misc";
export * from "./recommend";
