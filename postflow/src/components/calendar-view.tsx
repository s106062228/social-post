"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X, StickyNote } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ScheduledPost {
  id: string;
  content: string;
  scheduledAt: string;
  status: string;
}

interface CalendarNote {
  id: string;
  date: string;
  title: string;
  body?: string | null;
  color: string;
}

interface CalendarViewProps {
  posts: ScheduledPost[];
  notes?: CalendarNote[];
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

const NOTE_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444",
];

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

function NoteChip({
  note,
  onDelete,
}: {
  note: CalendarNote;
  onDelete: (id: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
          className="truncate rounded px-1 py-0.5 text-xs text-white cursor-pointer hover:opacity-90 select-none flex items-center gap-0.5"
          style={{ backgroundColor: note.color }}
          title={note.title}
        >
          <StickyNote className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{note.title}</span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: note.color }}
            />
            <p className="font-medium text-sm leading-snug">{note.title}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(note.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        {note.body && (
          <p className="mt-2 text-xs text-muted-foreground whitespace-pre-line">{note.body}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AddNotePopover({
  dateStr,
  onAdd,
}: {
  dateStr: string;
  onAdd: (note: CalendarNote) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [color, setColor] = useState(NOTE_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/calendar-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateStr,
          title: title.trim(),
          body: body.trim() || undefined,
          color,
        }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      const data = await res.json() as { note: CalendarNote };
      onAdd(data.note);
      setTitle("");
      setBody("");
      setColor(NOTE_COLORS[0]);
      setOpen(false);
      toast({ title: "Note added" });
    } catch {
      toast({ title: "Error", description: "Could not save note", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
          title="Add note"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="font-medium text-sm">Add Note — {dateStr}</p>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`note-title-${dateStr}`} className="text-xs">Title</Label>
            <Input
              id={`note-title-${dateStr}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Product launch"
              maxLength={200}
              required
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`note-body-${dateStr}`} className="text-xs">Notes (optional)</Label>
            <Textarea
              id={`note-body-${dateStr}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Additional details..."
              maxLength={2000}
              rows={2}
              className="text-sm resize-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Color</Label>
            <div className="flex gap-2">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    "h-5 w-5 rounded-full border-2 transition-transform",
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !title.trim()}>
              {saving ? "Saving…" : "Add"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
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

export function CalendarView({ posts: initialPosts, notes: initialNotes = [] }: CalendarViewProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [activeDragPostId, setActiveDragPostId] = useState<string | null>(null);
  const [localNotes, setLocalNotes] = useState<CalendarNote[]>(initialNotes);

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

  const notesByDate = new Map<string, CalendarNote[]>();
  for (const note of localNotes) {
    const existing = notesByDate.get(note.date) ?? [];
    notesByDate.set(note.date, [...existing, note]);
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

  function handleNoteAdded(note: CalendarNote) {
    setLocalNotes((prev) => [...prev, note]);
  }

  async function handleNoteDelete(noteId: string) {
    try {
      const res = await fetch(`/api/calendar-notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete note");
      setLocalNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast({ title: "Note deleted" });
    } catch {
      toast({ title: "Error", description: "Could not delete note", variant: "destructive" });
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
            const dateStr = day !== null
              ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
              : "";
            const dayNotes = dateStr ? (notesByDate.get(dateStr) ?? []) : [];

            const cell = (
              <div className="p-1 w-full h-full">
                {day && (
                  <>
                    <div className="flex items-center justify-between">
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
                      <AddNotePopover dateStr={dateStr} onAdd={handleNoteAdded} />
                    </div>
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {dayNotes.map((note) => (
                        <NoteChip key={note.id} note={note} onDelete={handleNoteDelete} />
                      ))}
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
                  "min-h-[96px] border-b border-r transition-colors group",
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
