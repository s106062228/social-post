"use client";

import { useState, useEffect, useCallback } from "react";
import { TOUR_STEPS, TOTAL_TOUR_STEPS, type TourStep } from "@/lib/tour";

interface TourState {
  completedSteps: string[];
  dismissed: boolean;
  isLoaded: boolean;
}

export function useTour() {
  const [state, setState] = useState<TourState>({
    completedSteps: [],
    dismissed: false,
    isLoaded: false,
  });
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    fetch("/api/tour")
      .then((r) => r.json())
      .then((data: { completedSteps: string[]; dismissed: boolean }) => {
        setState({
          completedSteps: data.completedSteps ?? [],
          dismissed: data.dismissed ?? false,
          isLoaded: true,
        });
      })
      .catch(() => {
        setState((s) => ({ ...s, isLoaded: true }));
      });
  }, []);

  const markStep = useCallback(async (stepKey: string) => {
    setState((s) => {
      if (s.completedSteps.includes(stepKey)) return s;
      return { ...s, completedSteps: [...s.completedSteps, stepKey] };
    });
    await fetch("/api/tour", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedStep: stepKey }),
    }).catch(() => {});
  }, []);

  const start = useCallback(() => {
    setCurrentStepIndex(0);
    setIsActive(true);
  }, []);

  const next = useCallback(async () => {
    const step = TOUR_STEPS[currentStepIndex];
    if (step) await markStep(step.key);
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex((i) => i + 1);
    } else {
      setIsActive(false);
    }
  }, [currentStepIndex, markStep]);

  const prev = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((i) => i - 1);
    }
  }, [currentStepIndex]);

  const skip = useCallback(async () => {
    setIsActive(false);
    setState((s) => ({ ...s, dismissed: true }));
    await fetch("/api/tour", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed: true }),
    }).catch(() => {});
  }, []);

  const currentStep: TourStep | undefined = TOUR_STEPS[currentStepIndex];
  const progressPercent = Math.round(
    (state.completedSteps.length / TOTAL_TOUR_STEPS) * 100
  );

  return {
    isActive,
    isLoaded: state.isLoaded,
    dismissed: state.dismissed,
    completedSteps: state.completedSteps,
    totalSteps: TOTAL_TOUR_STEPS,
    currentStep,
    currentStepIndex,
    progressPercent,
    start,
    next,
    prev,
    skip,
  };
}
