"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserCheck, UserX } from "lucide-react";

interface User {
  id: string;
  name: string | null;
  email: string;
}

interface AssigneeSelectorProps {
  postId: string;
  currentAssigneeId: string | null;
  users: User[];
}

export function AssigneeSelector({
  postId,
  currentAssigneeId,
  users,
}: AssigneeSelectorProps) {
  const router = useRouter();
  const [assigneeId, setAssigneeId] = useState<string | null>(currentAssigneeId);
  const [isPending, startTransition] = useTransition();

  async function assign(newAssigneeId: string | null) {
    const prev = assigneeId;
    setAssigneeId(newAssigneeId);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/assign`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assigneeId: newAssigneeId }),
        });

        if (!res.ok) {
          setAssigneeId(prev);
          toast({ title: "Failed to update assignee", variant: "destructive" });
          return;
        }

        const data = (await res.json()) as { assigneeId: string | null };
        setAssigneeId(data.assigneeId);

        if (data.assigneeId) {
          const user = users.find((u) => u.id === data.assigneeId);
          toast({ title: `Assigned to ${user?.name ?? user?.email ?? "user"}` });
        } else {
          toast({ title: "Assignee cleared" });
        }

        router.refresh();
      } catch {
        setAssigneeId(prev);
        toast({ title: "Failed to update assignee", variant: "destructive" });
      }
    });
  }

  const currentAssignee = users.find((u) => u.id === assigneeId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          title={currentAssignee ? `Assigned to ${currentAssignee.name ?? currentAssignee.email}` : "Assign user"}
          aria-label="Assign user"
        >
          {assigneeId ? (
            <UserCheck className="h-4 w-4 text-blue-500" />
          ) : (
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {users.map((user) => (
          <DropdownMenuItem
            key={user.id}
            onSelect={() => assign(user.id)}
            className={assigneeId === user.id ? "font-semibold" : ""}
          >
            {user.name ?? user.email}
          </DropdownMenuItem>
        ))}
        {assigneeId && (
          <DropdownMenuItem onSelect={() => assign(null)} className="text-destructive">
            <UserX className="mr-2 h-4 w-4" />
            Clear assignee
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
