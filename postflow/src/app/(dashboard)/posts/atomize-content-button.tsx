"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Scissors } from "lucide-react";
import { ContentAtomizeDialog } from "@/components/content-atomize-dialog";
import { useRouter } from "next/navigation";

export function AtomizeContentButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Scissors className="mr-2 h-4 w-4" />
        Atomize
      </Button>
      <ContentAtomizeDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
