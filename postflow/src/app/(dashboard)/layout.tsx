import { Sidebar } from "@/components/sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { ChangelogBadge } from "@/components/changelog-badge";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutHelp } from "@/components/shortcut-help";
import { GlobalShortcuts } from "@/components/global-shortcuts";
import { PublishingPauseBanner } from "@/components/publishing-pause-banner";
import { TourButton } from "@/components/tour-button";
import { ProductTour } from "@/components/product-tour";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Publishing pause warning banner */}
        <PublishingPauseBanner />
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-6">
          <TourButton />
          <div className="flex items-center gap-1">
            <ChangelogBadge />
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-muted/20">{children}</main>
      </div>
      {/* Global overlays — rendered outside the scroll container */}
      <CommandPalette />
      <ShortcutHelp />
      <GlobalShortcuts />
      <ProductTour />
    </div>
  );
}
