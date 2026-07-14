import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession() lee de localStorage sin red → mucho más rápido que getUser().
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw redirect({ to: "/auth" });
    if (typeof window !== "undefined" && !sessionStorage.getItem("role-verified-v1")) {
      throw redirect({ to: "/auth" });
    }
    return { user: session.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
