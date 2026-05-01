"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  href: string;
  completed: boolean;
}

interface OnboardingStatus {
  steps: OnboardingStep[];
  allComplete: boolean;
  dismissed: boolean;
}

export function OnboardingChecklist() {
  const { toast } = useToast();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/status");
      if (!res.ok) return;
      const data: OnboardingStatus = await res.json();
      setStatus(data);
    } catch {
      // silently fail — onboarding is non-critical
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleDismiss = useCallback(async () => {
    setDismissing(true);
    try {
      const res = await fetch("/api/onboarding/dismiss", { method: "POST" });
      if (!res.ok) throw new Error("Failed to dismiss");
      setStatus((prev: OnboardingStatus | null) => (prev ? { ...prev, dismissed: true } : null));
    } catch {
      toast({ title: "Error", description: "Could not dismiss checklist.", variant: "destructive" });
    } finally {
      setDismissing(false);
    }
  }, [toast]);

  if (!status || status.dismissed || status.allComplete) return null;

  const completedCount = status.steps.filter((s: OnboardingStep) => s.completed).length;
  const totalCount = status.steps.length;

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left"
          onClick={() => setCollapsed((c: boolean) => !c)}
          aria-expanded={!collapsed}
        >
          <Rocket className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            Get started with PostFlow
          </span>
          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {completedCount}/{totalCount}
          </span>
          <span className="ml-auto text-muted-foreground">
            {collapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </span>
        </button>
        <button
          type="button"
          aria-label="Dismiss onboarding checklist"
          onClick={handleDismiss}
          disabled={dismissing}
          className="ml-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-muted">
        <div
          className="h-1 bg-primary transition-all"
          style={{ width: `${(completedCount / totalCount) * 100}%` }}
        />
      </div>

      {/* Steps */}
      {!collapsed && (
        <ul className="divide-y px-4 py-2">
          {status.steps.map((step: OnboardingStep) => (
            <li key={step.id} className="flex items-start gap-3 py-3">
              {step.completed ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <Link
                  href={step.href}
                  className={cn(
                    "block text-sm font-medium hover:underline",
                    step.completed && "line-through text-muted-foreground"
                  )}
                >
                  {step.label}
                </Link>
                {!step.completed && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {step.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
