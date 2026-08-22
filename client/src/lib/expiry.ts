import type { ExpiryStatus } from "@shared/schema";

export const STATUS_LABEL: Record<ExpiryStatus, string> = {
  expired: "Expired",
  critical: "Expiring soon",
  warning: "Watch",
  fresh: "Fresh",
};

export const STATUS_CLASSES: Record<ExpiryStatus, { text: string; bg: string; dot: string }> = {
  expired: { text: "text-expiry-expired", bg: "bg-expiry-expired-bg", dot: "bg-expiry-expired" },
  critical: { text: "text-expiry-critical", bg: "bg-expiry-critical-bg", dot: "bg-expiry-critical" },
  warning: { text: "text-expiry-warning", bg: "bg-expiry-warning-bg", dot: "bg-expiry-warning" },
  fresh: { text: "text-expiry-fresh", bg: "bg-expiry-fresh-bg", dot: "bg-expiry-fresh" },
};

export function formatDaysUntil(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Expires today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
