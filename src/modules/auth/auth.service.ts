import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export type AuthResult = { error: string | null; needsEmailConfirmation?: boolean };

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/dashboard`,
      data: { display_name: displayName },
    },
  });
  if (error) return { error: error.message };
  return { error: null, needsEmailConfirmation: data.session === null };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

/** Returns true when the browser is being redirected to the provider. */
export async function signInWithGoogle(): Promise<{ error: string | null; redirected: boolean }> {
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
  });
  if (result.error) {
    const message =
      typeof result.error === "string"
        ? result.error
        : ((result.error as { message?: string }).message ?? "Google sign-in failed");
    return { error: message, redirected: false };
  }
  return { error: null, redirected: Boolean(result.redirected) };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
