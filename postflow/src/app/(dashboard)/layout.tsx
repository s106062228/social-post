import { Sidebar } from "@/components/sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutHelp } from "@/components/shortcut-help";
import { GlobalShortcuts } from "@/components/global-shortcuts";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-end border-b bg-card px-6">
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto bg-muted/20">{children}</main>
      </div>
      {/* Global overlays — rendered outside the scroll container */}
      <CommandPalette />
      <ShortcutHelp />
      <GlobalShortcuts />
    </div>
  );
}
