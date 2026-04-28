"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";

interface TwoFactorSettingsProps {
  totpEnabled: boolean;
}

type Step = "idle" | "setup" | "confirm" | "backup" | "disable";

export function TwoFactorSettings({ totpEnabled }: TwoFactorSettingsProps) {
  const [enabled, setEnabled] = useState(totpEnabled);
  const [step, setStep] = useState<Step>("idle");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function startSetup() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/setup");
      if (!res.ok) throw new Error("Failed to start setup");
      const data = (await res.json()) as { qrCode: string; secret: string };
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setCode("");
      setStep("setup");
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Setup failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function confirmEnable() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Invalid code");
      }
      const data = (await res.json()) as { backupCodes: string[] };
      setBackupCodes(data.backupCodes);
      setEnabled(true);
      setStep("backup");
      toast({
        title: "2FA enabled",
        description: "Save your backup codes in a safe place.",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Verification failed",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setCode("");
    }
  }

  async function confirmDisable() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Invalid code");
      }
      setEnabled(false);
      setStep("idle");
      toast({
        title: "2FA disabled",
        description: "Two-factor authentication has been turned off.",
      });
    } catch (err) {
      toast({
        title: "Failed to disable 2FA",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setCode("");
    }
  }

  async function copySecret() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (step === "setup") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Set Up Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Scan the QR code with your authenticator app (Google Authenticator,
            Authy, etc.), then enter the 6-digit code to confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {qrCode && (
            <div className="flex flex-col items-center gap-3">
              <Image
                src={qrCode}
                alt="TOTP QR code"
                width={200}
                height={200}
                unoptimized
              />
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 text-xs font-mono break-all">
                  {secret}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={copySecret}
                  className="h-6 w-6 shrink-0"
                  title="Copy secret"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Can't scan? Enter the key manually in your app.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="totp-code">Verification Code</Label>
            <Input
              id="totp-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9 ]*"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={7}
              className="text-center tracking-widest text-lg max-w-[160px]"
            />
          </div>

          <div className="flex gap-3">
            <Button
              onClick={confirmEnable}
              disabled={loading || code.replace(/\s/g, "").length < 6}
            >
              {loading ? "Verifying…" : "Enable 2FA"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setStep("idle")}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "backup") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <ShieldCheck className="h-5 w-5" />
            2FA Enabled — Save Your Backup Codes
          </CardTitle>
          <CardDescription>
            Store these codes somewhere safe. Each can be used once to sign in
            if you lose access to your authenticator app.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-4 font-mono text-sm">
            {backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <Button onClick={() => setStep("idle")} className="w-fit">
            Done
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "disable") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5" />
            Disable Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Enter your current 6-digit code (or a backup code) to confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="disable-code">Code</Label>
            <Input
              id="disable-code"
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-center tracking-widest text-lg max-w-[160px]"
            />
          </div>
          <div className="flex gap-3">
            <Button
              variant="destructive"
              onClick={confirmDisable}
              disabled={loading || !code.trim()}
            >
              {loading ? "Disabling…" : "Disable 2FA"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setStep("idle")}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // idle
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {enabled ? (
            <ShieldCheck className="h-5 w-5 text-green-600" />
          ) : (
            <ShieldOff className="h-5 w-5 text-muted-foreground" />
          )}
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          {enabled
            ? "Your account is protected with an authenticator app. Changes take effect on next login."
            : "Add an extra layer of security using a time-based one-time password (TOTP) app."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {enabled ? (
          <Button variant="outline" onClick={() => setStep("disable")}>
            Disable 2FA
          </Button>
        ) : (
          <Button onClick={startSetup} disabled={loading}>
            {loading ? "Loading…" : "Set Up 2FA"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
