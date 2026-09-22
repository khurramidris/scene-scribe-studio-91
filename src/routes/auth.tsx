import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "@/modules/auth/auth.service";
import { useAuth } from "@/modules/auth/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Backlot Studio" },
      {
        name: "description",
        content: "Sign in to Backlot Studio to produce AI microdramas and episodes.",
      },
      { property: "og:title", content: "Sign in — Backlot Studio" },
      {
        property: "og:description",
        content: "Sign in to Backlot Studio to produce AI microdramas and episodes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) void navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const result = await signUpWithEmail(email, password, displayName);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        if (result.needsEmailConfirmation) {
          toast.success("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
          return;
        }
        void navigate({ to: "/dashboard" });
      } else {
        const result = await signInWithEmail(email, password);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        void navigate({ to: "/dashboard" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await signInWithGoogle();
    if (result.error) {
      toast.error(result.error);
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/dashboard" });
    setBusy(false);
  }

  return (
    <div className="stage-light tech-grid flex min-h-screen items-center justify-center px-4 py-12">
      <div className="panel w-full max-w-md rounded-sm border border-border-strong p-8">
        <Link to="/" className="mb-7 flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-sm bg-primary">
            <Clapperboard className="size-3.5 text-primary-foreground" />
          </span>
          <span className="font-display text-base font-bold tracking-tight">Backlot Studio</span>
        </Link>
        <h1 className="text-2xl font-semibold">
          {mode === "signin" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Continue to your production workspace."
            : "Start producing AI drama episodes."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" ? (
            <div className="space-y-2">
              <Label htmlFor="displayName">Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ada Lovelace"
                required
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
          Continue with Google
        </Button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
