import { Sidebar } from "@/components/sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { ChangelogBadge } from "@/components/changelog-badge";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutHelp } from "@/components/shortcut-help";
import { GlobalShortcuts } from "@/components/global-shortcuts";
import { PublishingPauseBanner } from "@/components/publishing-pause-banner";
import { AccountHealthBanner } from "@/components/account-health-banner";
import { TourButton } from "@/components/tour-button";
import { ProductTour } from "@/components/product-tour";
import { AiChatPanel } from "@/components/ai-chat-panel";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Account health warning banner */}
        <AccountHealthBanner />
        {/* Publishing pause warning banner */}
        <PublishingPauseBanner />
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-6">
          <TourButton />
          <div className="flex items-center gap-1">
            <AiChatPanel />
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
