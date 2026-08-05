import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { MobileShell } from "@/components/mobile/mobile-shell";

import { useInboxNotifications } from "@/hooks/use-inbox-notifications";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
      });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      const { data } = await supabase.from("profiles").select("company_id").eq("id", userRes.user.id).maybeSingle();
      if (!cancel) setCompanyId(data?.company_id ?? null);
    })();
    return () => { cancel = true; };
  }, []);

  useInboxNotifications(companyId);

  if (isMobile) {
    return (
      <SidebarProvider>
        <MobileShell>
          <Outlet />
        </MobileShell>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <SidebarInset className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <AppTopbar />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
