"use client";

import { useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SocialBioGeneratorDialog } from "@/components/social-bio-generator-dialog";

export function GenerateBiosButton({
  connectedPlatforms,
}: {
  connectedPlatforms: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Bot className="mr-2 h-4 w-4" />
        Generate Bios
      </Button>
      <SocialBioGeneratorDialog
        open={open}
        onOpenChange={setOpen}
        connectedPlatforms={connectedPlatforms}
      />
    </>
  );
}
