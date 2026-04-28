"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";

export default function TwoFactorPage() {
  const router = useRouter();
  const { update } = useSession();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBackup, setShowBackup] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/2fa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Verification failed");
      }

      const { verificationToken } = (await res.json()) as {
        verificationToken: string;
      };

      // Update the JWT session to mark 2FA as verified
      await update({ verificationToken });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Two-Factor Authentication</CardTitle>
        <CardDescription>
          {showBackup
            ? "Enter one of your backup codes"
            : "Enter the 6-digit code from your authenticator app"}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">
              {showBackup ? "Backup Code" : "Verification Code"}
            </Label>
            <Input
              id="code"
              type="text"
              inputMode={showBackup ? "text" : "numeric"}
              pattern={showBackup ? undefined : "[0-9 ]*"}
              placeholder={showBackup ? "XXXXXX-XXXXXX" : "000000"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              autoComplete="one-time-code"
              className="text-center tracking-widest text-lg"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading || !code.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground text-sm"
            onClick={() => {
              setShowBackup((v) => !v);
              setCode("");
              setError(null);
            }}
          >
            {showBackup
              ? "Use authenticator app instead"
              : "Use a backup code instead"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
