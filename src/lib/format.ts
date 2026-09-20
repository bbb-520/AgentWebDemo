/** 时间显示：x 分钟前 / 今天 / 昨天 / 具体日期 */
export function fmtAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const d = new Date(ts);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, new Date(now.getTime() - 86400000))) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO-8601(UTC) 时间戳 → 本地「YYYY-MM-DD HH:mm」；解析失败原样返回（摘要卡时间段展示用） */
export function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 毫秒 → 人类可读耗时 */
export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 粗略估算 token 数：CJK 字符按 1 token，非 CJK 按词数 × 1.3 */
export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
  const words = (text.replace(/[^\w\s]/g, ' ').trim().match(/\S+/g) || []).length;
  return Math.max(1, Math.ceil(cjk + words * 1.3));
}
