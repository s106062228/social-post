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
import { DisconnectAccountButton } from "./disconnect-account-button";

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
  const hasLinkedIn = accounts.some((a) => a.platform === Platform.LINKEDIN);
  const hasPinterest = accounts.some((a) => a.platform === Platform.PINTEREST);
  const hasYouTube = accounts.some((a) => a.platform === Platform.YOUTUBE);
  const hasTikTok = accounts.some((a) => a.platform === Platform.TIKTOK);
  const hasTwitter = accounts.some((a) => a.platform === Platform.TWITTER);
  const hasBluesky = accounts.some((a) => a.platform === Platform.BLUESKY);
  const hasMastodon = accounts.some((a) => a.platform === Platform.MASTODON);
  const hasTelegram = accounts.some((a) => a.platform === Platform.TELEGRAM);
  const hasReddit = accounts.some((a) => a.platform === Platform.REDDIT);
  const hasAnyMeta = hasFacebook || hasInstagram || hasThreads;

  const linkedInEnabled = !!(
    process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET
  );
  const pinterestEnabled = !!(
    process.env.PINTEREST_CLIENT_ID && process.env.PINTEREST_CLIENT_SECRET
  );
  const youtubeEnabled = !!(
    process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET
  );
  const tiktokEnabled = !!(
    process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET
  );
  const twitterEnabled = !!(
    process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET
  );
  // Bluesky uses app passwords — no client credentials required
  const blueskyEnabled = true;
  // Mastodon uses access tokens — no client credentials required
  const mastodonEnabled = true;
  // Telegram uses Bot API tokens — no client credentials required
  const telegramEnabled = true;
  const redditEnabled = !!(
    process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET
  );

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

      {/* LinkedIn connection card */}
      {linkedInEnabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>LinkedIn</CardTitle>
                <CardDescription>
                  Connect your LinkedIn personal profile to publish professional
                  posts.
                </CardDescription>
              </div>
              <a
                href="/api/oauth/linkedin/connect"
                className="inline-flex items-center justify-center rounded-md bg-[#0077B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#005885] focus:outline-none focus:ring-2 focus:ring-[#0077B5] focus:ring-offset-2 disabled:opacity-50"
              >
                {hasLinkedIn ? "Reconnect LinkedIn" : "Connect LinkedIn"}
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-1">
              <PlatformStatus name="LinkedIn" connected={hasLinkedIn} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pinterest connection card */}
      {pinterestEnabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Pinterest</CardTitle>
                <CardDescription>
                  Connect your Pinterest account to publish image pins to your
                  first board.
                </CardDescription>
              </div>
              <a
                href="/api/oauth/pinterest/connect"
                className="inline-flex items-center justify-center rounded-md bg-[#E60023] px-4 py-2 text-sm font-medium text-white hover:bg-[#B60020] focus:outline-none focus:ring-2 focus:ring-[#E60023] focus:ring-offset-2"
              >
                {hasPinterest ? "Reconnect Pinterest" : "Connect Pinterest"}
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-1">
              <PlatformStatus name="Pinterest" connected={hasPinterest} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* YouTube connection card */}
      {youtubeEnabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>YouTube</CardTitle>
                <CardDescription>
                  Connect your YouTube channel to publish video content via the
                  YouTube Data API v3.
                </CardDescription>
              </div>
              <a
                href="/api/oauth/youtube/connect"
                className="inline-flex items-center justify-center rounded-md bg-[#FF0000] px-4 py-2 text-sm font-medium text-white hover:bg-[#CC0000] focus:outline-none focus:ring-2 focus:ring-[#FF0000] focus:ring-offset-2"
              >
                {hasYouTube ? "Reconnect YouTube" : "Connect YouTube"}
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-1">
              <PlatformStatus name="YouTube" connected={hasYouTube} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* TikTok connection card */}
      {tiktokEnabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>TikTok</CardTitle>
                <CardDescription>
                  Connect your TikTok account to publish video content via the
                  TikTok Content Posting API.
                </CardDescription>
              </div>
              <a
                href="/api/oauth/tiktok/connect"
                className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
              >
                {hasTikTok ? "Reconnect TikTok" : "Connect TikTok"}
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-1">
              <PlatformStatus name="TikTok" connected={hasTikTok} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* X (Twitter) connection card */}
      {twitterEnabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>X (Twitter)</CardTitle>
                <CardDescription>
                  Connect your X account to publish tweets and images via the
                  Twitter API v2.
                </CardDescription>
              </div>
              <a
                href="/api/oauth/twitter/connect"
                className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
              >
                {hasTwitter ? "Reconnect X" : "Connect X"}
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-1">
              <PlatformStatus name="X (Twitter)" connected={hasTwitter} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bluesky connection card */}
      {blueskyEnabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Bluesky</CardTitle>
                <CardDescription>
                  Connect your Bluesky account to publish text and image posts
                  via the AT Protocol.
                </CardDescription>
              </div>
              <a
                href="/accounts/bluesky-connect"
                className="inline-flex items-center justify-center rounded-md bg-[#0085FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0070D8] focus:outline-none focus:ring-2 focus:ring-[#0085FF] focus:ring-offset-2"
              >
                {hasBluesky ? "Reconnect Bluesky" : "Connect Bluesky"}
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-1">
              <PlatformStatus name="Bluesky" connected={hasBluesky} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mastodon connection card */}
      {mastodonEnabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Mastodon</CardTitle>
                <CardDescription>
                  Connect your Mastodon account to publish text and image posts
                  via the Mastodon API. Supports any Mastodon instance.
                </CardDescription>
              </div>
              <a
                href="/accounts/mastodon-connect"
                className="inline-flex items-center justify-center rounded-md bg-[#6364FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#5253CC] focus:outline-none focus:ring-2 focus:ring-[#6364FF] focus:ring-offset-2"
              >
                {hasMastodon ? "Reconnect Mastodon" : "Connect Mastodon"}
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-1">
              <PlatformStatus name="Mastodon" connected={hasMastodon} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Telegram connection card */}
      {telegramEnabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Telegram</CardTitle>
                <CardDescription>
                  Connect a Telegram Bot to publish text and image posts to any
                  channel or group via the Telegram Bot API.
                </CardDescription>
              </div>
              <a
                href="/accounts/telegram-connect"
                className="inline-flex items-center justify-center rounded-md bg-[#2AABEE] px-4 py-2 text-sm font-medium text-white hover:bg-[#229ED9] focus:outline-none focus:ring-2 focus:ring-[#2AABEE] focus:ring-offset-2"
              >
                {hasTelegram ? "Reconnect Telegram" : "Connect Telegram"}
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-1">
              <PlatformStatus name="Telegram" connected={hasTelegram} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reddit connection card */}
      {redditEnabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Reddit</CardTitle>
                <CardDescription>
                  Connect your Reddit account to publish text and link posts to
                  subreddits you moderate.
                </CardDescription>
              </div>
              <a
                href="/api/oauth/reddit/connect"
                className="inline-flex items-center justify-center rounded-md bg-[#FF4500] px-4 py-2 text-sm font-medium text-white hover:bg-[#E03D00] focus:outline-none focus:ring-2 focus:ring-[#FF4500] focus:ring-offset-2"
              >
                {hasReddit ? "Reconnect Reddit" : "Connect Reddit"}
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-1">
              <PlatformStatus name="Reddit" connected={hasReddit} />
            </div>
          </CardContent>
        </Card>
      )}

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
                  <DisconnectAccountButton
                    accountId={account.id}
                    accountName={account.accountName}
                  />
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
    config_error: "OAuth configuration error. Please check your app settings.",
    state_mismatch: "Security check failed. Please try again.",
    token_exchange: "Failed to exchange tokens. Please try again.",
    account_store: "Failed to store account. Please try again.",
    invalid_state: "Security check failed. Please try again.",
    missing_params: "Missing OAuth parameters. Please try again.",
    oauth_failed: "OAuth connection failed. Please try again.",
    no_boards: "No Pinterest boards found. Please create a board first.",
    bluesky_auth_failed: "Bluesky authentication failed. Check your handle and app password.",
    telegram_auth_failed: "Telegram authentication failed. Check your bot token and chat ID.",
    reddit_auth_failed: "Reddit authentication failed. Please try again.",
  };
  return messages[code] ?? "An unexpected error occurred. Please try again.";
}
