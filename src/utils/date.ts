/**
 * 日期工具。统一用 UTC 取值，避免「date-only 的 frontmatter 在本地时区被偏移一天」。
 */

/** 2026-06-08 -> "2026-06-08" */
export function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 2026-06-08 -> "2026 年 6 月 8 日" */
export function formatDateCN(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return `${y} 年 ${m} 月 ${d} 日`;
}

/** ISO 字符串（用于 <time datetime>） */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getYear(date: Date): number {
  return date.getUTCFullYear();
}

/** 月份，补零："06" */
export function getMonth(date: Date): string {
  return String(date.getUTCMonth() + 1).padStart(2, '0');
}
