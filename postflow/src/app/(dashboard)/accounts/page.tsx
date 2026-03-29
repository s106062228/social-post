import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Platform } from "@prisma/client";
import { OAuthConnect } from "@/components/oauth-connect";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, AlertCircle } from "lucide-react";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  const userId = session!.user!.id;

  const { error, success } = await searchParams;

  const accounts = await prisma.socialAccount.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  const hasFacebook = accounts.some((a) => a.platform === Platform.FACEBOOK);
  const hasInstagram = accounts.some((a) => a.platform === Platform.INSTAGRAM);
  const hasThreads = accounts.some((a) => a.platform === Platform.THREADS);
  const hasAnyMeta = hasFacebook || hasInstagram || hasThreads;

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Connected Accounts</h1>
        <p className="text-muted-foreground">
          Connect your social media accounts to start publishing posts.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessage(error)}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Accounts connected successfully!
        </div>
      )}

      {/* Meta connection card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Meta Platforms</CardTitle>
              <CardDescription>
                Connect Facebook, Instagram, and Threads with a single OAuth
                flow.
              </CardDescription>
            </div>
            <OAuthConnect isConnected={hasAnyMeta} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <PlatformStatus name="Facebook" connected={hasFacebook} />
            <PlatformStatus name="Instagram" connected={hasInstagram} />
            <PlatformStatus name="Threads" connected={hasThreads} />
          </div>
        </CardContent>
      </Card>

      {/* Accounts list */}
      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Accounts</CardTitle>
            <CardDescription>
              {accounts.length} account{accounts.length !== 1 ? "s" : ""}{" "}
              connected
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{account.accountName}</p>
                    <p className="text-sm text-muted-foreground">
                      {account.platform}
                      {account.tokenExpiresAt && (
                        <> &middot; Expires{" "}
                          {new Date(account.tokenExpiresAt).toLocaleDateString()}
                        </>
                      )}
                    </p>
                  </div>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Active
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PlatformStatus({
  name,
  connected,
}: {
  name: string;
  connected: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border p-3">
      <span
        className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-300"}`}
      />
      <span className="text-sm font-medium">{name}</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {connected ? "Connected" : "Not connected"}
      </span>
    </div>
  );
}

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    config_error: "OAuth configuration error. Please check your Meta App settings.",
    state_mismatch: "Security check failed. Please try again.",
    token_exchange: "Failed to exchange tokens. Please try again.",
    account_store: "Failed to store account. Please try again.",
  };
  return messages[code] ?? "An unexpected error occurred. Please try again.";
}
