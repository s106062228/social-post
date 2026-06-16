"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Leaf } from "lucide-react";
import { EvergreenDiscoveryCard } from "@/components/evergreen-discovery-card";

export function EvergreenDiscoverButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Leaf className="mr-2 h-4 w-4 text-green-500" />
        Discover
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Evergreen Content Discovery</DialogTitle>
          </DialogHeader>
          <EvergreenDiscoveryCard />
        </DialogContent>
      </Dialog>
    </>
  );
}
