import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
export const ANON_KEY =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
export const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

export const hasLiveDatabase = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY);

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestAccount = {
  id: string;
  email: string;
  client: SupabaseClient;
};

/** Creates a confirmed throwaway account and returns a signed-in client for it. */
export async function createAccount(tag: string): Promise<TestAccount> {
  const admin = adminClient();
  const email = `isolation.${tag}.${crypto.randomUUID().slice(0, 8)}@backlot.test`;
  const password = `Test-${crypto.randomUUID()}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message ?? "Could not create the test account.");

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(signInError.message);

  return { id: data.user.id, email, client };
}

export async function deleteAccount(account: TestAccount): Promise<void> {
  const admin = adminClient();
  await admin.from("projects").delete().eq("owner_id", account.id);
  await admin.auth.admin.deleteUser(account.id);
}
