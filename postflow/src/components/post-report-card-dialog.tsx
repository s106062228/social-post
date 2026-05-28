"use client";

import { useState, useTransition } from "react";
import { FileBarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface Dimension {
  name: string;
  score: number;
  grade: string;
  details: string;
}

interface ReportCardData {
  postId: string;
  content: string;
  overallGrade: "A" | "B" | "C" | "D" | "F";
  overallScore: number;
  dimensions: Dimension[];
  totalEngagement: number;
  topPlatform: string | null;
  publishedPlatforms: string[];
  recommendations: string[];
}

function gradeColor(grade: string): string {
  if (grade === "A") return "text-green-600 bg-green-50 border-green-200";
  if (grade === "B") return "text-blue-600 bg-blue-50 border-blue-200";
  if (grade === "C") return "text-yellow-600 bg-yellow-50 border-yellow-200";
  if (grade === "D") return "text-orange-600 bg-orange-50 border-orange-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function scoreBarColor(score: number): string {
  if (score >= 85) return "bg-green-500";
  if (score >= 70) return "bg-blue-500";
  if (score >= 55) return "bg-yellow-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

interface PostReportCardDialogProps {
  postId: string;
}

export function PostReportCardDialog({ postId }: PostReportCardDialogProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ReportCardData | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && !data) {
      startTransition(async () => {
        try {
          const res = await fetch(`/api/posts/${postId}/report-card`);
          if (!res.ok) {
            const json = (await res.json()) as { error?: string };
            throw new Error(json.error ?? "Failed to load report card");
          }
          const json = (await res.json()) as ReportCardData;
          setData(json);
        } catch (err) {
          toast({
            title: "Failed to load report card",
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          });
          setOpen(false);
        }
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Performance report card">
          <FileBarChart2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Performance Report Card</DialogTitle>
        </DialogHeader>

        {isPending && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading report…
          </div>
        )}

        {!isPending && data && (
          <div className="space-y-5">
            {/* Overall grade */}
            <div className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 text-3xl font-bold ${gradeColor(data.overallGrade)}`}
              >
                {data.overallGrade}
              </div>
              <div>
                <p className="text-sm font-medium">Overall Score</p>
                <p className="text-2xl font-bold">{data.overallScore}/100</p>
                {data.publishedPlatforms.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Published on {data.publishedPlatforms.join(", ")}
                    {data.topPlatform && ` · Top: ${data.topPlatform}`}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not yet published</p>
                )}
              </div>
              {data.totalEngagement > 0 && (
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">Total Engagement</p>
                  <p className="text-lg font-semibold">
                    {data.totalEngagement.toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {/* Dimension breakdown */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Breakdown</p>
              {data.dimensions.map((dim) => (
                <div key={dim.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{dim.name}</span>
                    <span className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className={`px-1.5 py-0 text-xs ${gradeColor(dim.grade)}`}
                      >
                        {dim.grade}
                      </Badge>
                      <span className="text-muted-foreground">{dim.score}/100</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div
                      className={`h-1.5 rounded-full transition-all ${scoreBarColor(dim.score)}`}
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{dim.details}</p>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Recommendations</p>
              <ul className="space-y-1">
                {data.recommendations.map((rec, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                    <span className="shrink-0 font-bold text-primary">→</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
