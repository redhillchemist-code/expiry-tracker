import type { ExpiryStatus } from "@shared/schema";
import { STATUS_CLASSES, STATUS_LABEL } from "@/lib/expiry";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: ExpiryStatus; className?: string }) {
  const c = STATUS_CLASSES[status];
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-0.5 text-xs font-semibold",
        c.bg,
        c.text,
        className
      )}
      data-testid={`badge-status-${status}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {STATUS_LABEL[status]}
    </div>
  );
}
