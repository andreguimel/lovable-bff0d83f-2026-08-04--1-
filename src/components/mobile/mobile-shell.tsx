import { useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { MobileTopBar } from "./mobile-top-bar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { MobileDrawer } from "./mobile-drawer";
import { MobileFabProvider, MobileFabSlot } from "./mobile-fab";

/**
 * Mobile-native shell: Top App Bar + scrollable content + Bottom Navigation
 * + slide-in Drawer + contextual FAB slot. Used in place of the desktop
 * SidebarProvider/AppSidebar/AppTopbar layout when the viewport is below
 * the `md` breakpoint.
 *
 * When on a full-screen route (e.g. a specific inbox conversation) the top
 * bar and bottom nav are hidden so the page owns the whole viewport.
 */
export function MobileShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Fullscreen when on /inbox/<conversationId>
  const isFullscreen = /^\/inbox\/[^/]+/.test(pathname);

  return (
    <MobileFabProvider>
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
        {!isFullscreen && <MobileTopBar onOpenDrawer={() => setDrawerOpen(true)} />}
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
          <MobileFabSlot />
        </main>
        {!isFullscreen && <MobileBottomNav onOpenDrawer={() => setDrawerOpen(true)} />}
        <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      </div>
    </MobileFabProvider>
  );
}
