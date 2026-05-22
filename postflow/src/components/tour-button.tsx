"use client";

import { Map, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour } from "@/hooks/use-tour";
import { TOTAL_TOUR_STEPS } from "@/lib/tour";

export function TourButton() {
  const { isLoaded, dismissed, completedSteps, start } = useTour();

  if (!isLoaded || dismissed) return null;

  const allDone = completedSteps.length >= TOTAL_TOUR_STEPS;

  if (allDone) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle className="h-3.5 w-3.5" />
        Tour complete
      </div>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={start} className="gap-1.5">
      <Map className="h-4 w-4" />
      Take the tour
      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
        {completedSteps.length}/{TOTAL_TOUR_STEPS}
      </span>
    </Button>
  );
}
