import type { ApprovalStatus } from "@/modules/story/story.types";
import { STATUS_LABELS } from "@/modules/story/story.types";
import { cn } from "@/lib/utils";

const STYLES: Record<ApprovalStatus, string> = {
  draft: "border-border-strong text-muted-foreground",
  pending: "border-warning/45 text-warning",
  approved: "border-success/45 text-success",
  rejected: "border-destructive/45 text-destructive",
};

export function StatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <span
      className={cn(
        "rounded-sm border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
        STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function MockBadge() {
  return (
    <span
      title="Development placeholder — not a real AI generation"
      className="rounded-sm border border-primary/55 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary"
    >
      Mock
    </span>
  );
}
