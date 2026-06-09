"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wand2 } from "lucide-react";
import { BulkGenerateDialog } from "@/components/bulk-generate-dialog";
import { useRouter } from "next/navigation";

export function BulkGenerateButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Wand2 className="mr-2 h-4 w-4" />
        Bulk Generate
      </Button>
      <BulkGenerateDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
