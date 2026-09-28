"use server";

import { redirect } from "next/navigation";
import { isOwnerEmail } from "@/lib/owner";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Approve or deny an OAuth authorization request (Supabase Auth's OAuth 2.1 server). Supabase
 * answers with the client's redirect URL: the authorization code on approval, access_denied
 * otherwise. Only the owner may approve; anyone else can only deny.
 */
export async function decide(formData: FormData) {
  const id = String(formData.get("authorization_id") ?? "");
  const approve = formData.get("decision") === "approve";
  if (!id) redirect("/oauth/consent");

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);

  const owner = isOwnerEmail(auth.user.email);
  const { data, error } =
    approve && owner
      ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url)
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=decision_failed`);
  redirect(data.redirect_url);
}
