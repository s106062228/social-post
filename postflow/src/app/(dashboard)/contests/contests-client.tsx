"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Trophy,
  Plus,
  Trash2,
  Loader2,
  Users,
  CalendarRange,
  Gift,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface ContestEntry {
  id: string;
  contestId: string;
  participantName: string;
  participantHandle: string;
  platform: string | null;
  entryType: string;
  isWinner: boolean;
  pickedAt: string | null;
  createdAt: string;
}

interface Contest {
  id: string;
  name: string;
  description: string | null;
  platform: string | null;
  postId: string | null;
  startDate: string | null;
  endDate: string | null;
  prizeDescription: string | null;
  requiredAction: string;
  winnersCount: number;
  status: "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  _count: { entries: number };
}

interface ContestDetail extends Contest {
  entries: ContestEntry[];
}

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  ACTIVE: "default",
  ENDED: "secondary",
  CANCELLED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ENDED: "Ended",
  CANCELLED: "Cancelled",
};

export function ContestsClient() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawingId, setDrawingId] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prize, setPrize] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [winnersCount, setWinnersCount] = useState("1");
  const [requiredAction, setRequiredAction] = useState("comment");
  const [status, setStatus] = useState("DRAFT");

  // Entry form state
  const [entryName, setEntryName] = useState("");
  const [entryHandle, setEntryHandle] = useState("");
  const [addingEntry, setAddingEntry] = useState(false);

  const fetchContests = useCallback(async () => {
    try {
      const res = await fetch("/api/contests");
      if (!res.ok) throw new Error("Failed to load contests");
      const data = await res.json() as { contests: Contest[] };
      setContests(data.contests);
    } catch {
      toast.error("Failed to load contests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchContests();
  }, [fetchContests]);

  async function fetchDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/contests/${id}`);
      if (!res.ok) throw new Error("Failed to load contest detail");
      const data = await res.json() as ContestDetail;
      setDetail(data);
    } catch {
      toast.error("Failed to load contest details");
    } finally {
      setDetailLoading(false);
    }
  }

  function handleToggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
    } else {
      setExpandedId(id);
      setDetail(null);
      void fetchDetail(id);
    }
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Contest name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/contests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          prizeDescription: prize.trim() || undefined,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          winnersCount: parseInt(winnersCount) || 1,
          requiredAction,
          status,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Failed to create contest");
      }
      toast.success("Contest created");
      setName("");
      setDescription("");
      setPrize("");
      setStartDate("");
      setEndDate("");
      setWinnersCount("1");
      setRequiredAction("comment");
      setStatus("DRAFT");
      setShowForm(false);
      await fetchContests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create contest");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this contest and all its entries?")) return;
    try {
      const res = await fetch(`/api/contests/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error("Failed to delete contest");
      }
      toast.success("Contest deleted");
      if (expandedId === id) {
        setExpandedId(null);
        setDetail(null);
      }
      await fetchContests();
    } catch {
      toast.error("Failed to delete contest");
    }
  }

  async function handleAddEntry(contestId: string) {
    if (!entryName.trim() || !entryHandle.trim()) {
      toast.error("Participant name and handle are required");
      return;
    }
    setAddingEntry(true);
    try {
      const res = await fetch(`/api/contests/${contestId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantName: entryName.trim(),
          participantHandle: entryHandle.trim(),
          entryType: "manual",
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Failed to add entry");
      }
      toast.success("Entry added");
      setEntryName("");
      setEntryHandle("");
      await fetchDetail(contestId);
      await fetchContests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add entry");
    } finally {
      setAddingEntry(false);
    }
  }

  async function handleDeleteEntry(contestId: string, entryId: string) {
    try {
      const res = await fetch(`/api/contests/${contestId}/entries/${entryId}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        throw new Error("Failed to delete entry");
      }
      toast.success("Entry removed");
      await fetchDetail(contestId);
      await fetchContests();
    } catch {
      toast.error("Failed to remove entry");
    }
  }

  async function handleDraw(contestId: string) {
    if (!confirm("Draw winners now? This will end the contest.")) return;
    setDrawingId(contestId);
    try {
      const res = await fetch(`/api/contests/${contestId}/draw`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Failed to draw winners");
      }
      const data = await res.json() as { winners: ContestEntry[]; total: number };
      toast.success(`${data.total} winner${data.total !== 1 ? "s" : ""} selected!`);
      await fetchDetail(contestId);
      await fetchContests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to draw winners");
    } finally {
      setDrawingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Create form */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">New Contest</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus className="h-4 w-4 mr-1" />
            {showForm ? "Cancel" : "Create Contest"}
          </Button>
        </CardHeader>
        {showForm && (
          <CardContent className="flex flex-col gap-3">
            <Input
              placeholder="Contest name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <Input
              placeholder="Prize description"
              value={prize}
              onChange={(e) => setPrize(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Start date</label>
                <Input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">End date</label>
                <Input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Winners</label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={winnersCount}
                  onChange={(e) => setWinnersCount(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Required action</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={requiredAction}
                  onChange={(e) => setRequiredAction(e.target.value)}
                >
                  <option value="comment">Comment</option>
                  <option value="share">Share</option>
                  <option value="follow">Follow</option>
                  <option value="like">Like</option>
                  <option value="tag">Tag a friend</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                </select>
              </div>
            </div>
            <Button onClick={handleCreate} disabled={submitting} className="self-start">
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Contest
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Contest list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {contests.length} contest{contests.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Trophy className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No contests yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first contest above to start tracking entries.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {contests.map((contest) => (
                <div key={contest.id} className="py-4 first:pt-0 last:pb-0">
                  {/* Contest row */}
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{contest.name}</span>
                        <Badge variant={STATUS_BADGE[contest.status] ?? "outline"}>
                          {STATUS_LABEL[contest.status] ?? contest.status}
                        </Badge>
                        {contest.platform && (
                          <Badge variant="outline" className="text-xs">
                            {contest.platform.charAt(0) +
                              contest.platform.slice(1).toLowerCase().replace(/_/g, " ")}
                          </Badge>
                        )}
                      </div>

                      {contest.prizeDescription && (
                        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                          <Gift className="h-3 w-3" />
                          {contest.prizeDescription}
                        </p>
                      )}

                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {contest._count.entries} entr{contest._count.entries !== 1 ? "ies" : "y"}
                        </span>
                        <span>
                          {contest.winnersCount} winner{contest.winnersCount !== 1 ? "s" : ""}
                        </span>
                        {(contest.startDate ?? contest.endDate) && (
                          <span className="flex items-center gap-1">
                            <CalendarRange className="h-3 w-3" />
                            {contest.startDate
                              ? new Date(contest.startDate).toLocaleDateString()
                              : "—"}
                            {" → "}
                            {contest.endDate
                              ? new Date(contest.endDate).toLocaleDateString()
                              : "ongoing"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleExpand(contest.id)}
                      >
                        {expandedId === contest.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        {expandedId === contest.id ? "Hide" : "View"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(contest.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedId === contest.id && (
                    <div className="mt-4 rounded-md border bg-muted/30 p-4 flex flex-col gap-4">
                      {detailLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading entries...
                        </div>
                      ) : detail ? (
                        <>
                          {/* Winners section */}
                          {detail.status === "ENDED" && (
                            <div>
                              <h3 className="text-sm font-semibold flex items-center gap-1 mb-2">
                                <Trophy className="h-4 w-4 text-yellow-500" />
                                Winners
                              </h3>
                              {detail.entries.filter((e) => e.isWinner).length === 0 ? (
                                <p className="text-xs text-muted-foreground">No winners drawn yet</p>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  {detail.entries
                                    .filter((e) => e.isWinner)
                                    .map((winner) => (
                                      <div
                                        key={winner.id}
                                        className="flex items-center gap-2 rounded-md bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 text-sm"
                                      >
                                        <Trophy className="h-3 w-3 text-yellow-500 shrink-0" />
                                        <span className="font-medium">{winner.participantName}</span>
                                        <span className="text-muted-foreground">
                                          {winner.participantHandle}
                                        </span>
                                        {winner.pickedAt && (
                                          <span className="ml-auto text-xs text-muted-foreground">
                                            {new Date(winner.pickedAt).toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Draw winners button */}
                          {contest.status !== "ENDED" && contest.status !== "CANCELLED" && (
                            <Button
                              size="sm"
                              onClick={() => handleDraw(contest.id)}
                              disabled={drawingId === contest.id || detail._count.entries === 0}
                              className="self-start"
                            >
                              {drawingId === contest.id ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Trophy className="h-4 w-4 mr-2" />
                              )}
                              Draw Winners
                            </Button>
                          )}

                          {/* Add entry form */}
                          {contest.status !== "ENDED" && contest.status !== "CANCELLED" && (
                            <div className="flex flex-col gap-2">
                              <h3 className="text-sm font-semibold">Add Entry</h3>
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Participant name"
                                  value={entryName}
                                  onChange={(e) => setEntryName(e.target.value)}
                                  className="flex-1"
                                />
                                <Input
                                  placeholder="Handle / username"
                                  value={entryHandle}
                                  onChange={(e) => setEntryHandle(e.target.value)}
                                  className="flex-1"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleAddEntry(contest.id)}
                                  disabled={addingEntry}
                                >
                                  {addingEntry ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Plus className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Entries list */}
                          <div>
                            <h3 className="text-sm font-semibold mb-2">
                              Entries ({detail._count.entries})
                            </h3>
                            {detail.entries.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                No entries yet. Add participants above.
                              </p>
                            ) : (
                              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                                {detail.entries
                                  .filter((e) => !e.isWinner)
                                  .map((entry) => (
                                    <div
                                      key={entry.id}
                                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 group"
                                    >
                                      <span className="font-medium">{entry.participantName}</span>
                                      <span className="text-muted-foreground text-xs">
                                        {entry.participantHandle}
                                      </span>
                                      {entry.platform && (
                                        <Badge variant="outline" className="text-xs ml-1">
                                          {entry.platform.toLowerCase()}
                                        </Badge>
                                      )}
                                      <span className="ml-auto text-xs text-muted-foreground">
                                        {new Date(entry.createdAt).toLocaleDateString()}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                                        onClick={() =>
                                          handleDeleteEntry(contest.id, entry.id)
                                        }
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
