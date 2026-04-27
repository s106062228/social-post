"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";

interface MemberActionsProps {
  teamId: string;
  userId: string;
  currentRole: string;
  isSelf: boolean;
}

export function MemberActions({ teamId, userId, currentRole, isSelf }: MemberActionsProps) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [loadingRole, setLoadingRole] = useState(false);
  const [loadingRemove, setLoadingRemove] = useState(false);

  async function handleRoleChange(newRole: string) {
    setRole(newRole);
    setLoadingRole(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to update role");
      }
      toast.success("Role updated");
      router.refresh();
    } catch (err) {
      setRole(currentRole);
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setLoadingRole(false);
    }
  }

  async function handleRemove() {
    const msg = isSelf ? "Leave this team?" : "Remove this member?";
    if (!confirm(msg)) return;
    setLoadingRemove(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to remove member");
      }
      toast.success(isSelf ? "You left the team" : "Member removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setLoadingRemove(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {!isSelf && (
        <Select value={role} onValueChange={handleRoleChange} disabled={loadingRole}>
          <SelectTrigger className="h-7 w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="EDITOR">Editor</SelectItem>
            <SelectItem value="VIEWER">Viewer</SelectItem>
          </SelectContent>
        </Select>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:bg-destructive/10"
        onClick={handleRemove}
        disabled={loadingRemove}
        title={isSelf ? "Leave team" : "Remove member"}
      >
        <UserMinus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
