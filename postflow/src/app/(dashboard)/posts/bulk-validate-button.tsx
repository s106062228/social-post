"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkValidationDialog } from "@/components/bulk-validation-dialog";

interface BulkValidateButtonProps {
  selectedIds: string[];
  onDone: () => void;
}

export function BulkValidateButton({ selectedIds, onDone }: BulkValidateButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={selectedIds.length === 0}
      >
        <ShieldCheck className="mr-2 h-4 w-4" />
        Validate ({selectedIds.length})
      </Button>

      <BulkValidationDialog
        selectedIds={selectedIds}
        open={open}
        onOpenChange={setOpen}
        onDone={onDone}
      />
    </>
  );
}
