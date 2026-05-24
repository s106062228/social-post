"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface CollapsibleProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

const CollapsibleContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({ open: false, onOpenChange: () => {} });

function Collapsible({
  open = false,
  onOpenChange,
  children,
  className,
}: CollapsibleProps) {
  const handleChange = React.useCallback(
    (value: boolean) => {
      onOpenChange?.(value);
    },
    [onOpenChange]
  );

  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange: handleChange }}>
      <div className={cn(className)}>{children}</div>
    </CollapsibleContext.Provider>
  );
}

function CollapsibleTrigger({
  asChild,
  children,
  className,
}: {
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { open, onOpenChange } = React.useContext(CollapsibleContext);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
      onClick: (e: React.MouseEvent) => {
        const originalOnClick = (children as React.ReactElement<React.HTMLAttributes<HTMLElement>>).props.onClick;
        if (originalOnClick) originalOnClick(e as React.MouseEvent<HTMLElement>);
        onOpenChange(!open);
      },
    });
  }

  return (
    <button
      type="button"
      className={cn(className)}
      onClick={() => onOpenChange(!open)}
      aria-expanded={open}
    >
      {children}
    </button>
  );
}

function CollapsibleContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { open } = React.useContext(CollapsibleContext);

  if (!open) return null;

  return <div className={cn(className)}>{children}</div>;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
