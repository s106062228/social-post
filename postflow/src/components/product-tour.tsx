"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour } from "@/hooks/use-tour";
import { TOUR_STEPS } from "@/lib/tour";

export function ProductTour() {
  const router = useRouter();
  const {
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps,
    completedSteps,
    next,
    prev,
    skip,
  } = useTour();

  // Navigate to the step's target path when the step changes
  useEffect(() => {
    if (isActive && currentStep?.targetPath) {
      router.push(currentStep.targetPath);
    }
  }, [isActive, currentStep, router]);

  if (!isActive || !currentStep) return null;

  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === totalSteps - 1;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border bg-card shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Map className="h-4 w-4" />
          <span>
            Step {currentStepIndex + 1} of {totalSteps}
          </span>
        </div>
        <button
          onClick={skip}
          className="rounded p-1 hover:bg-muted"
          aria-label="Skip tour"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        <div className="mb-2 text-2xl">{currentStep.icon}</div>
        <h3 className="mb-1 font-semibold">{currentStep.title}</h3>
        <p className="text-sm text-muted-foreground">{currentStep.description}</p>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 px-4">
        {TOUR_STEPS.map((step, idx) => (
          <div
            key={step.key}
            className={`h-1.5 rounded-full transition-all ${
              idx === currentStepIndex
                ? "w-4 bg-primary"
                : completedSteps.includes(step.key)
                  ? "w-1.5 bg-primary/50"
                  : "w-1.5 bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={prev}
          disabled={isFirst}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

        <button
          onClick={skip}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Skip tour
        </button>

        <Button size="sm" onClick={next} className="gap-1">
          {isLast ? "Finish" : "Next"}
          {!isLast && <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
