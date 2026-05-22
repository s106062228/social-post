"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useCalendarReschedule } from "@/hooks/use-calendar-reschedule";
import { parseDayDropId } from "@/lib/calendar-reschedule";
import { toast } from "@/hooks/use-toast";

interface ScheduledPost {
  id: string;
  content: string;
  scheduledAt: string;
  status: string;
}

interface CalendarViewProps {
  posts: ScheduledPost[];
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DraggablePost({
  post,
  disabled,
}: {
  post: ScheduledPost;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: post.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "truncate rounded bg-blue-100 px-1 py-0.5 text-xs text-blue-800 hover:bg-blue-200 select-none",
        !disabled && "cursor-grab active:cursor-grabbing",
        disabled && "cursor-default",
        isDragging && "opacity-40"
      )}
      title={post.content}
    >
      {post.content.slice(0, 30)}
      {post.content.length > 30 && "…"}
    </div>
  );
}

function DroppableDay({
  dayId,
  children,
  className,
}: {
  dayId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayId });

  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && "bg-blue-50 ring-1 ring-inset ring-blue-300")}
    >
      {children}
    </div>
  );
}

function PostGhost({ post }: { post: ScheduledPost }) {
  return (
    <div className="truncate rounded bg-blue-200 px-1 py-0.5 text-xs text-blue-900 shadow-md max-w-[120px]">
      {post.content.slice(0, 30)}
      {post.content.length > 30 && "…"}
    </div>
  );
}

export function CalendarView({ posts: initialPosts }: CalendarViewProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [activeDragPostId, setActiveDragPostId] = useState<string | null>(null);

  const { posts, handleDrop, isDraggable } = useCalendarReschedule(initialPosts);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const postsByDay = new Map<string, ScheduledPost[]>();
  for (const post of posts) {
    const d = new Date(post.scheduledAt);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = d.getDate().toString();
      const existing = postsByDay.get(key) ?? [];
      postsByDay.set(key, [...existing, post]);
    }
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const cells: (number | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function handleDragStart(event: DragStartEvent) {
    setActiveDragPostId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragPostId(null);
    const { active, over } = event;
    if (!over) return;

    const postId = active.id as string;
    const dayId = over.id as string;

    const parsed = parseDayDropId(dayId);
    if (!parsed) return;

    const { year: targetYear, month: targetMonth, day: targetDay } = parsed;

    const success = await handleDrop(postId, targetYear, targetMonth, targetDay);
    if (success) {
      const newDate = new Date(targetYear, targetMonth, targetDay);
      toast({
        title: "Post rescheduled",
        description: `Post moved to ${newDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      });
    } else {
      toast({
        title: "Reschedule failed",
        description: "Could not update the post schedule.",
        variant: "destructive",
      });
    }
  }

  const activePost = activeDragPostId
    ? posts.find((p) => p.id === activeDragPostId)
    : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="rounded-lg border bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">
            {MONTH_NAMES[month]} {year}
          </h2>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 border-b">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const isToday =
              day !== null &&
              day === today.getDate() &&
              month === today.getMonth() &&
              year === today.getFullYear();
            const dayPosts = day ? (postsByDay.get(day.toString()) ?? []) : [];
            const dayId = day !== null ? `day-${year}-${month}-${day}` : `empty-${i}`;

            const cell = (
              <div className="p-1 w-full h-full">
                {day && (
                  <>
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-sm",
                        isToday
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-foreground"
                      )}
                    >
                      {day}
                    </span>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {dayPosts.slice(0, 3).map((post) => (
                        <DraggablePost
                          key={post.id}
                          post={post}
                          disabled={!isDraggable(post.id)}
                        />
                      ))}
                      {dayPosts.length > 3 && (
                        <span className="px-1 text-xs text-muted-foreground">
                          +{dayPosts.length - 3} more
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );

            return day !== null ? (
              <DroppableDay
                key={i}
                dayId={dayId}
                className={cn(
                  "min-h-[96px] border-b border-r transition-colors",
                  i % 7 === 6 && "border-r-0",
                  i >= cells.length - 7 && "border-b-0"
                )}
              >
                {cell}
              </DroppableDay>
            ) : (
              <div
                key={i}
                className={cn(
                  "min-h-[96px] border-b border-r p-1",
                  i % 7 === 6 && "border-r-0",
                  i >= cells.length - 7 && "border-b-0"
                )}
              />
            );
          })}
        </div>
      </div>

      <DragOverlay>
        {activePost && <PostGhost post={activePost} />}
      </DragOverlay>
    </DndContext>
  );
}
