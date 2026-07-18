// Lấy access_token đảm bảo CÒN HẠN cho các route AI (copilot/judge/ops-report/patient-summary).
// getSession() KHÔNG tự refresh → token sắp hết hạn gây 401 oan. Refresh nếu còn <60s.
import { supabase } from "@/integrations/supabase/client";

export async function getFreshToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed.session ?? session;
  }
  return session?.access_token ?? null;
}
