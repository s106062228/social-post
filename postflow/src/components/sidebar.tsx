"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Calendar,
  Users,
  BarChart2,
  LayoutTemplate,
  Repeat,
  Settings,
  LogOut,
  Activity,
  ImageIcon,
  Hash,
  ListOrdered,
  Webhook,
  ClipboardCheck,
  Megaphone,
  Rss,
  UsersRound,
  KeyRound,
  Mail,
  FileUp,
  SearchIcon,
  Trophy,
  FlaskConical,
  BellRing,
  Link2,
  Lightbulb,
  Target,
  BookMarked,
  Zap,
  Workflow,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/search", label: "Search", icon: SearchIcon },
  { href: "/posts", label: "Posts", icon: FileText },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/accounts", label: "Accounts", icon: Users },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/schedules", label: "Schedules", icon: Repeat },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/ab-tests", label: "A/B Tests", icon: FlaskConical },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/media", label: "Media", icon: ImageIcon },
  { href: "/hashtags", label: "Hashtags", icon: Hash },
  { href: "/queue", label: "Queue", icon: ListOrdered },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/approvals", label: "Approvals", icon: ClipboardCheck },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/rss-feeds", label: "RSS Feeds", icon: Rss },
  { href: "/teams", label: "Teams", icon: UsersRound },
  { href: "/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/reports", label: "Reports", icon: Mail },
  { href: "/import", label: "Import", icon: FileUp },
  { href: "/performance-alerts", label: "Alerts", icon: BellRing },
  { href: "/utm-presets", label: "UTM Tags", icon: Link2 },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/posting-goals", label: "Goals", icon: Target },
  { href: "/snippets", label: "Snippets", icon: BookMarked },
  { href: "/integrations", label: "Integrations", icon: Zap },
  { href: "/zapier", label: "Zapier", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <span className="text-xl font-bold tracking-tight text-primary">
          PostFlow
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle + sign out */}
      <div className="border-t p-4 flex flex-col gap-1">
        <ThemeToggle />
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
