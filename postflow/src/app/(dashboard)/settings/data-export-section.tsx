"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, Trash2, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

// ── Export Data Section ───────────────────────────────────────────────────────

function ExportDataCard() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setIsExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Export failed");
      }

      // Trigger browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Extract filename from Content-Disposition header if available
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "postflow-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Export My Data
        </CardTitle>
        <CardDescription>
          Download a copy of all your PostFlow data including posts, accounts, templates, campaigns,
          tags, and activity history. You can request an export up to 3 times per hour.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {exportError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{exportError}</AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground">
          Your export will be a JSON file containing:
        </p>
        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
          <li>Profile and account settings</li>
          <li>Connected social accounts (without access tokens)</li>
          <li>All posts and their publish results</li>
          <li>Templates, campaigns, tags, and hashtag groups</li>
          <li>Activity log (last 90 days)</li>
        </ul>
        <Button onClick={handleExport} disabled={isExporting} className="self-start mt-2">
          {isExporting ? "Preparing export…" : "Download My Data"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Delete Account Section ────────────────────────────────────────────────────

interface DeleteAccountCardProps {
  userEmail: string;
}

function DeleteAccountCard({ userEmail }: DeleteAccountCardProps) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    if (confirmEmail.toLowerCase() !== userEmail.toLowerCase()) {
      setError("Email does not match your account email.");
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail }),
      });

      if (res.status === 204) {
        // Account deleted — sign out and redirect
        await signOut({ redirect: false });
        router.push("/?deleted=1");
        return;
      }

      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Deletion failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 className="h-5 w-5" />
          Delete Account
        </CardTitle>
        <CardDescription>
          Permanently delete your account and all associated data. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Warning — this action is permanent</AlertTitle>
          <AlertDescription>
            Deleting your account will permanently remove all your posts, social account connections,
            templates, campaigns, analytics data, and other content. There is no recovery option.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-email">
            Type your email address <span className="font-mono text-xs">({userEmail})</span> to
            confirm:
          </Label>
          <Input
            id="confirm-email"
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder={userEmail}
            className="border-destructive/30 focus:border-destructive"
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={
            isDeleting || confirmEmail.toLowerCase() !== userEmail.toLowerCase()
          }
          className="self-start"
        >
          {isDeleting ? "Deleting account…" : "Permanently Delete My Account"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

interface DataExportSectionProps {
  userEmail: string;
}

export function DataExportSection({ userEmail }: DataExportSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Privacy & Data</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your data and account lifecycle.
        </p>
      </div>
      <ExportDataCard />
      <DeleteAccountCard userEmail={userEmail} />
    </div>
  );
}
