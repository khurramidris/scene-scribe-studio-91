import type { ApprovalStatus } from "@/modules/story/story.types";
import { STATUS_LABELS } from "@/modules/story/story.types";
import { cn } from "@/lib/utils";

const STYLES: Record<ApprovalStatus, string> = {
  draft: "border-border text-muted-foreground",
  pending: "border-amber-500/40 text-amber-400",
  approved: "border-emerald-500/40 text-emerald-400",
  rejected: "border-destructive/40 text-destructive",
};

export function StatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
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
      className="rounded-full border border-orange-500/50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-400"
    >
      Mock
    </span>
  );
}
