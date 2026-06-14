"use client";

import { Bold, Italic, Strikethrough, Code, Smile } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatText, convertEmojiShortcodes, type TextStyle } from "@/lib/text-formatter";

interface TextFormatterBarProps {
  content: string;
  onApply: (newContent: string) => void;
  disabled?: boolean;
}

type ButtonDef = {
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  style?: TextStyle;
  action?: () => void;
};

export function TextFormatterBar({ content, onApply, disabled }: TextFormatterBarProps) {
  const applyStyle = (style: TextStyle) => {
    if (!content.trim()) {
      toast({ title: "No content to format", variant: "destructive" });
      return;
    }
    const formatted = formatText(content, style);
    onApply(formatted);
    toast({ title: "Formatting applied" });
  };

  const applyEmojiConversion = () => {
    if (!content.trim()) return;
    const converted = convertEmojiShortcodes(content);
    if (converted === content) {
      toast({ title: "No emoji shortcodes found (try :fire: :heart: :rocket:)" });
    } else {
      onApply(converted);
      toast({ title: "Emoji shortcodes converted" });
    }
  };

  const buttons: ButtonDef[] = [
    {
      label: "Bold",
      shortLabel: "B",
      icon: <Bold className="h-3 w-3" />,
      style: "bold",
    },
    {
      label: "Italic",
      shortLabel: "I",
      icon: <Italic className="h-3 w-3" />,
      style: "italic",
    },
    {
      label: "Bold Italic",
      shortLabel: "BI",
      icon: (
        <span className="flex">
          <Bold className="h-3 w-3" />
          <Italic className="h-3 w-3" />
        </span>
      ),
      style: "bold-italic",
    },
    {
      label: "Strikethrough",
      shortLabel: "S̶",
      icon: <Strikethrough className="h-3 w-3" />,
      style: "strikethrough",
    },
    {
      label: "Monospace",
      shortLabel: "Mono",
      icon: <Code className="h-3 w-3" />,
      style: "monospace",
    },
    {
      label: "Convert :shortcodes: to emoji",
      shortLabel: ":emoji:",
      icon: <Smile className="h-3 w-3" />,
      action: applyEmojiConversion,
    },
  ];

  const isDisabled = disabled || !content.trim();

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-xs text-muted-foreground">Style:</span>
      {buttons.map(({ label, shortLabel, icon, style, action }) => (
        <button
          key={label}
          type="button"
          title={label}
          disabled={isDisabled}
          onClick={() => (action ? action() : style && applyStyle(style))}
          className="flex items-center gap-1 rounded border border-input bg-background px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          {icon}
          <span className="hidden md:inline">{shortLabel}</span>
        </button>
      ))}
    </div>
  );
}
