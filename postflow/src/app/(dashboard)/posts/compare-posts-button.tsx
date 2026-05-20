"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BarChart2 } from "lucide-react";
import { PostComparisonDialog } from "@/components/post-comparison-dialog";

interface ComparePostsButtonProps {
  selectedIds: string[];
}

export function ComparePostsButton({ selectedIds }: ComparePostsButtonProps) {
  const [open, setOpen] = useState(false);

  if (selectedIds.length < 2 || selectedIds.length > 5) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <BarChart2 className="mr-2 h-4 w-4" />
        Compare
      </Button>
      <PostComparisonDialog
        postIds={selectedIds}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
