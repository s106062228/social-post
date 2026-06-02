"use client";

import { useEffect, useState, useCallback } from "react";
import { QueueMonitorCard } from "@/components/queue-monitor-card";
import type { QueueJobsResponse, QueueJob } from "@/app/api/queue/jobs/route";
import { toast } from "sonner";

const STATE_TABS = ["all", "waiting", "active", "failed", "delayed"] as const;
type StateTab = (typeof STATE_TABS)[number];

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

export function QueueMonitorPageClient() {
  const [activeTab, setActiveTab] = useState<StateTab>("all");
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const fetchJobs = useCallback(async (tab: StateTab) => {
    setLoading(true);
    try {
      const url =
        tab === "all" ? "/api/queue/jobs" : `/api/queue/jobs?state=${tab}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data: QueueJobsResponse = await res.json();
      setJobs(data.jobs);
    } catch {
      toast.error("Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs(activeTab);
  }, [activeTab, fetchJobs]);

  async function retryJob(jobId: string) {
    setRetrying(jobId);
    try {
      const res = await fetch(`/api/queue/jobs/${jobId}/retry`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to retry job");
        return;
      }
      toast.success("Job queued for retry");
      fetchJobs(activeTab);
    } catch {
      toast.error("Failed to retry job");
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Queue Monitor</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live view of the BullMQ publish queue. Refreshes every 15 seconds.
          </p>
        </div>
        <button
          onClick={() => fetchJobs(activeTab)}
          className="text-sm px-3 py-1.5 border rounded-md hover:bg-muted transition-colors"
        >
          Refresh
        </button>
      </div>

      <QueueMonitorCard />

      {/* Job list */}
      <div className="rounded-xl border bg-card">
        {/* Tabs */}
        <div className="flex border-b">
          {STATE_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            No jobs in <span className="font-medium">{activeTab}</span> state.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Job ID</th>
                <th className="text-left px-4 py-2.5 font-medium">State</th>
                <th className="text-left px-4 py-2.5 font-medium">Post ID</th>
                <th className="text-left px-4 py-2.5 font-medium">Platform</th>
                <th className="text-left px-4 py-2.5 font-medium">Attempts</th>
                <th className="text-left px-4 py-2.5 font-medium">Timestamp</th>
                <th className="text-left px-4 py-2.5 font-medium">Reason</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground truncate max-w-[120px]">
                    {job.id}
                  </td>
                  <td className="px-4 py-2.5">
                    <StateBadge state={job.state} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground truncate max-w-[120px]">
                    {job.postId ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">{job.platform ?? "—"}</td>
                  <td className="px-4 py-2.5 text-center">{job.attemptsMade}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {formatDate(job.timestamp)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-red-600 dark:text-red-400 max-w-[180px] truncate">
                    {job.failedReason ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {job.state === "failed" && (
                      <button
                        onClick={() => retryJob(job.id)}
                        disabled={retrying === job.id}
                        className="text-xs px-2.5 py-1 border rounded hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        {retrying === job.id ? "Retrying…" : "Retry"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const colorMap: Record<string, string> = {
    waiting: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    delayed: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    completed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  const cls = colorMap[state] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${cls}`}>
      {state}
    </span>
  );
}
