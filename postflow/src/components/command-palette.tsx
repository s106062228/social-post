"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Calendar,
  Users,
  BarChart2,
  LayoutTemplate,
  Repeat,
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
  PlusCircle,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { matchesShortcut, APP_SHORTCUTS } from "@/lib/shortcuts";
import type { ShortcutDefinition } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  group: string;
  keywords?: string[];
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

function buildCommands(router: ReturnType<typeof useRouter>): Command[] {
  const nav = (href: string) => () => router.push(href);
  return [
    // Actions
    { id: "new-post", label: "New Post", group: "Actions", keywords: ["create", "write", "draft"], icon: PlusCircle, action: nav("/posts/new") },
    // Navigation
    { id: "go-dashboard", label: "Dashboard", group: "Navigation", keywords: ["home"], icon: LayoutDashboard, action: nav("/") },
    { id: "go-posts", label: "Posts", group: "Navigation", keywords: ["list", "drafts"], icon: FileText, action: nav("/posts") },
    { id: "go-calendar", label: "Calendar", group: "Navigation", keywords: ["schedule"], icon: Calendar, action: nav("/calendar") },
    { id: "go-accounts", label: "Accounts", group: "Navigation", keywords: ["social", "connect", "oauth"], icon: Users, action: nav("/accounts") },
    { id: "go-templates", label: "Templates", group: "Navigation", keywords: ["template", "reuse"], icon: LayoutTemplate, action: nav("/templates") },
    { id: "go-schedules", label: "Recurring Schedules", group: "Navigation", keywords: ["recurring", "cron"], icon: Repeat, action: nav("/schedules") },
    { id: "go-analytics", label: "Analytics", group: "Navigation", keywords: ["stats", "insights", "reports"], icon: BarChart2, action: nav("/analytics") },
    { id: "go-activity", label: "Activity Log", group: "Navigation", keywords: ["history", "log", "audit"], icon: Activity, action: nav("/activity") },
    { id: "go-media", label: "Media Library", group: "Navigation", keywords: ["images", "videos", "uploads", "assets"], icon: ImageIcon, action: nav("/media") },
    { id: "go-hashtags", label: "Hashtag Groups", group: "Navigation", keywords: ["hashtag", "tags"], icon: Hash, action: nav("/hashtags") },
    { id: "go-queue", label: "Post Queue", group: "Navigation", keywords: ["queue", "optimal"], icon: ListOrdered, action: nav("/queue") },
    { id: "go-webhooks", label: "Webhooks", group: "Navigation", keywords: ["integration", "webhook"], icon: Webhook, action: nav("/webhooks") },
    { id: "go-approvals", label: "Approvals", group: "Navigation", keywords: ["approve", "review"], icon: ClipboardCheck, action: nav("/approvals") },
    { id: "go-campaigns", label: "Campaigns", group: "Navigation", keywords: ["campaign", "series"], icon: Megaphone, action: nav("/campaigns") },
    { id: "go-rss", label: "RSS Feeds", group: "Navigation", keywords: ["rss", "feed", "import"], icon: Rss, action: nav("/rss-feeds") },
    { id: "go-teams", label: "Teams", group: "Navigation", keywords: ["team", "members", "collaborate"], icon: UsersRound, action: nav("/teams") },
    { id: "go-api-keys", label: "API Keys", group: "Navigation", keywords: ["api", "token", "key"], icon: KeyRound, action: nav("/api-keys") },
    { id: "go-reports", label: "Reports", group: "Navigation", keywords: ["report", "analytics", "email"], icon: Mail, action: nav("/reports") },
    { id: "go-import", label: "Import Posts", group: "Navigation", keywords: ["csv", "import", "bulk"], icon: FileUp, action: nav("/import") },
    { id: "go-settings", label: "Settings", group: "Navigation", keywords: ["preferences", "profile", "theme"], icon: Settings, action: nav("/settings") },
  ];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const paletteDef = APP_SHORTCUTS.find(
    (s): s is ShortcutDefinition => s.id === "command-palette"
  )!;

  const commands = buildCommands(router);

  const filtered = query.trim()
    ? commands.filter((cmd) => {
        const q = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(q) ||
          cmd.group.toLowerCase().includes(q) ||
          cmd.keywords?.some((k) => k.includes(q))
        );
      })
    : commands;

  // Reset active index whenever the filtered list changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // CMD+K / Ctrl+K opens the palette
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (matchesShortcut(e, paletteDef)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteDef]);

  // Arrow key + Enter navigation while palette is open
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[activeIndex];
        if (cmd) {
          cmd.action();
          setOpen(false);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, activeIndex]);

  // Focus the input whenever the palette opens
  useEffect(() => {
    if (open) {
      setQuery("");
      // Defer to let the dialog animate in
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [open]);

  const runCommand = useCallback(
    (cmd: Command) => {
      cmd.action();
      setOpen(false);
    },
    []
  );

  // Group filtered results
  const groups = filtered.reduce<Record<string, Command[]>>((acc, cmd) => {
    (acc[cmd.group] ??= []).push(cmd);
    return acc;
  }, {});

  // Flat list for activeIndex tracking
  const flatList = Object.values(groups).flat();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 overflow-hidden max-w-lg gap-0">
        {/* Search input */}
        <div className="flex items-center border-b px-4">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands…"
            className="h-12 border-0 shadow-none focus-visible:ring-0 text-base px-0"
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {flatList.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">
              No commands found
            </p>
          ) : (
            Object.entries(groups).map(([group, cmds]) => (
              <div key={group}>
                <p className="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                {cmds.map((cmd) => {
                  const globalIdx = flatList.indexOf(cmd);
                  const isActive = globalIdx === activeIndex;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => runCommand(cmd)}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      )}
                    >
                      <cmd.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{cmd.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="border-t px-4 py-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
