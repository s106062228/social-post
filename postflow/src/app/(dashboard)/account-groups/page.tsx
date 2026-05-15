"use client";

import { useState, useEffect, useCallback } from "react";
import { FolderOpen, Plus, Trash2, Pencil, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface SocialAccount {
  id: string;
  platform: string;
  accountName: string;
}

interface AccountGroup {
  id: string;
  name: string;
  accountIds: string[];
  createdAt: string;
  updatedAt: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  PINTEREST: "Pinterest",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  TWITTER: "X (Twitter)",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  TELEGRAM: "Telegram",
  REDDIT: "Reddit",
  NOSTR: "Nostr",
  TUMBLR: "Tumblr",
  WORDPRESS: "WordPress",
  MEDIUM: "Medium",
  GHOST: "Ghost",
  DEVTO: "Dev.to",
  HASHNODE: "Hashnode",
};

function AccountChip({ account }: { account: SocialAccount }) {
  return (
    <Badge variant="secondary" className="text-xs">
      {account.accountName} · {PLATFORM_LABELS[account.platform] ?? account.platform}
    </Badge>
  );
}

function AccountMultiSelect({
  accounts,
  selected,
  onChange,
}: {
  accounts: SocialAccount[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {accounts.map((account) => {
        const isSelected = selected.includes(account.id);
        return (
          <button
            key={account.id}
            type="button"
            onClick={() => toggle(account.id)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-foreground hover:bg-muted"
            }`}
          >
            {account.accountName}
            <span className="opacity-70">· {PLATFORM_LABELS[account.platform] ?? account.platform}</span>
          </button>
        );
      })}
      {accounts.length === 0 && (
        <p className="text-xs text-muted-foreground">No connected accounts found.</p>
      )}
    </div>
  );
}

export default function AccountGroupsPage() {
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAccountIds, setNewAccountIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAccountIds, setEditAccountIds] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [groupsRes, accountsRes] = await Promise.all([
        fetch("/api/account-groups"),
        fetch("/api/accounts"),
      ]);
      const groupsData = (await groupsRes.json()) as { groups?: AccountGroup[] };
      const accountsData = (await accountsRes.json()) as { accounts?: SocialAccount[] };
      setGroups(groupsData.groups ?? []);
      setAccounts(accountsData.accounts ?? []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/account-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), accountIds: newAccountIds }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        toast.error(data.error ?? "Failed to create group");
        return;
      }
      toast.success("Account group created");
      setCreating(false);
      setNewName("");
      setNewAccountIds([]);
      await load();
    } catch {
      toast.error("Failed to create group");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(group: AccountGroup) {
    setEditingId(group.id);
    setEditName(group.name);
    setEditAccountIds([...group.accountIds]);
  }

  async function handleUpdate() {
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/account-groups/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), accountIds: editAccountIds }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        toast.error(data.error ?? "Failed to update group");
        return;
      }
      toast.success("Group updated");
      setEditingId(null);
      await load();
    } catch {
      toast.error("Failed to update group");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/account-groups/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete group");
        return;
      }
      toast.success("Group deleted");
      setGroups((prev) => prev.filter((g) => g.id !== id));
    } catch {
      toast.error("Failed to delete group");
    } finally {
      setDeletingId(null);
    }
  }

  function getAccountsForGroup(group: AccountGroup): SocialAccount[] {
    return accounts.filter((a) => group.accountIds.includes(a.id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Account Groups</h1>
        </div>
        <Button onClick={() => setCreating(true)} disabled={creating}>
          <Plus className="mr-2 h-4 w-4" />
          New Group
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Group your connected social accounts together for faster selection when composing posts.
      </p>

      {/* Create form */}
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Account Group</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Group name</Label>
              <Input
                placeholder="e.g. Personal Brand, Work Accounts…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Accounts in this group</Label>
              <AccountMultiSelect
                accounts={accounts}
                selected={newAccountIds}
                onChange={setNewAccountIds}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!newName.trim() || saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create Group
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                  setNewAccountIds([]);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Groups list */}
      {groups.length === 0 && !creating ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <FolderOpen className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No account groups yet. Create one to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const isEditing = editingId === group.id;
            const groupAccounts = getAccountsForGroup(group);

            return (
              <Card key={group.id}>
                <CardContent className="pt-4">
                  {isEditing ? (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <Label>Group name</Label>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleUpdate();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Accounts in this group</Label>
                        <AccountMultiSelect
                          accounts={accounts}
                          selected={editAccountIds}
                          onChange={setEditAccountIds}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleUpdate}
                          disabled={!editName.trim() || editSaving}
                        >
                          {editSaving ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3 w-3" />
                          )}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="mr-1 h-3 w-3" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-2">
                        <p className="font-medium">{group.name}</p>
                        {groupAccounts.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {groupAccounts.map((account) => (
                              <AccountChip key={account.id} account={account} />
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No accounts assigned</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {group.accountIds.length} account{group.accountIds.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => startEdit(group)}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void handleDelete(group.id)}
                          disabled={deletingId === group.id}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          {deletingId === group.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
