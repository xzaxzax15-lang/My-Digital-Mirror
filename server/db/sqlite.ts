import { createRequire } from "node:module";

/**
 * جسر node:sqlite عبر createRequire — يتجاوز تحليل الاستيراد الساكن في حزم البناء
 * (Vite/vitest في بعض الإصدارات لا تعرف node:sqlite كوحدة مدمجة).
 */
const nodeRequire = createRequire(import.meta.url);
export const DatabaseSync = nodeRequire("node:sqlite").DatabaseSync as new (path: string) => {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};
