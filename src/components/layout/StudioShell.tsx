import { Link, useNavigate } from "@tanstack/react-router";
import { Clapperboard, LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/modules/auth/auth.service";
import { useAuth } from "@/modules/auth/useAuth";

export function StudioShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Clapperboard className="size-5 text-primary" />
            <span className="font-display text-sm font-semibold tracking-tight">
              Backlot Studio
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/queue"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              Production queue
            </Link>
            {user?.email ? (
              <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                void navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
