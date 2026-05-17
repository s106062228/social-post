"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ImageIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface AltTextInputProps {
  mediaUrls: string[];
  altTexts: string[];
  onChange: (altTexts: string[]) => void;
}

const MAX_ALT_LENGTH = 2200;

export function AltTextInput({ mediaUrls, altTexts, onChange }: AltTextInputProps) {
  const [expanded, setExpanded] = useState(false);

  if (mediaUrls.length === 0) return null;

  const handleChange = (index: number, value: string) => {
    const updated = [...altTexts];
    updated[index] = value;
    onChange(updated);
  };

  const getValue = (index: number) => altTexts[index] ?? "";
  const hasAnyAlt = altTexts.some((t) => t && t.trim().length > 0);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-fit items-center gap-1.5 px-0 text-xs text-muted-foreground hover:text-foreground"
      >
        <ImageIcon className="h-3.5 w-3.5" />
        Alt text (accessibility)
        {hasAnyAlt && !expanded && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {altTexts.filter((t) => t?.trim()).length}
          </span>
        )}
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </Button>

      {expanded && (
        <div className="flex flex-col gap-3 rounded-md border border-input bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">
            Describe each image for screen readers and accessibility. Supported on Facebook, Instagram, and X (Twitter).
          </p>
          {mediaUrls.map((url, i) => {
            const val = getValue(i);
            return (
              <div key={i} className="flex flex-col gap-1.5">
                <Label htmlFor={`alt-text-${i}`} className="text-xs text-muted-foreground">
                  Image {i + 1}
                  {url && (
                    <span className="ml-1 font-normal truncate max-w-[180px] inline-block align-bottom">
                      — {url.split("/").pop()}
                    </span>
                  )}
                </Label>
                <Textarea
                  id={`alt-text-${i}`}
                  placeholder={`Describe image ${i + 1}…`}
                  value={val}
                  onChange={(e) => handleChange(i, e.target.value)}
                  className="min-h-[60px] resize-none text-xs"
                  maxLength={MAX_ALT_LENGTH}
                />
                {val.length > 0 && (
                  <p className="text-right text-[10px] text-muted-foreground">
                    {val.length}/{MAX_ALT_LENGTH}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
