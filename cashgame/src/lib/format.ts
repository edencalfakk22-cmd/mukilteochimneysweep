/** Hebrew/Israeli date & time formatting (Asia/Jerusalem, 24h clock). */

const TZ = "Asia/Jerusalem";

const dateFmt = new Intl.DateTimeFormat("he-IL", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("he-IL", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateTimeFmt = new Intl.DateTimeFormat("he-IL", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatDate(d: Date | string): string {
  return dateFmt.format(new Date(d));
}

export function formatTime(d: Date | string): string {
  return timeFmt.format(new Date(d));
}

export function formatDateTime(d: Date | string): string {
  return dateTimeFmt.format(new Date(d));
}

/** Relative "time ago" in Hebrew, for last-activity stamps. */
export function formatTimeAgo(d: Date | string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(d).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}
