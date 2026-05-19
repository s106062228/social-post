"use client";

import { BatchScheduleDialog } from "@/components/batch-schedule-dialog";

interface BatchScheduleButtonProps {
  selectedIds: string[];
  onDone: () => void;
}

export function BatchScheduleButton({ selectedIds, onDone }: BatchScheduleButtonProps) {
  if (selectedIds.length < 2) return null;
  return <BatchScheduleDialog postIds={selectedIds} onDone={onDone} />;
}
