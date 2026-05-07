import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Zapier Integration — PostFlow" };

const BASE_URL = process.env.NEXTAUTH_URL ?? "https://your-postflow-domain.com";

export default function ZapierPage() {
  const postsUrl = `${BASE_URL}/api/zap/posts`;
  const publishedUrl = `${BASE_URL}/api/zap/published`;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">Zapier Integration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect PostFlow to 6,000+ apps using Zapier polling triggers and your
          personal API key.
        </p>
      </div>

      {/* Step 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 1 — Get your API key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Go to{" "}
            <Link href="/api-keys" className="underline text-primary">
              Settings → API Keys
            </Link>{" "}
            and create a new key. Copy the full key — it is shown only once.
          </p>
          <p className="text-muted-foreground">
            Keep it secret. Anyone with the key can read your posts.
          </p>
        </CardContent>
      </Card>

      {/* Step 2 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 2 — Create a Zapier Zap</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              In Zapier, create a new Zap and choose{" "}
              <strong>Webhooks by Zapier</strong> (or <strong>Schedule</strong>)
              as the trigger.
            </li>
            <li>
              For a polling trigger, use <strong>Webhooks → Retrieve Poll</strong>{" "}
              (available on paid Zapier plans) or schedule a{" "}
              <strong>Code by Zapier</strong> step that calls one of the endpoints
              below.
            </li>
            <li>
              Set the <code>x-api-key</code> request header to your PostFlow API
              key.
            </li>
            <li>
              Use the <code>since</code> query param to retrieve only new items
              since the last poll (Zapier will pass the last run timestamp).
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available Endpoints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          {/* New posts */}
          <div className="space-y-2">
            <p className="font-semibold">New posts trigger</p>
            <code className="block rounded bg-muted px-3 py-2 text-xs break-all">
              GET {postsUrl}?since=&lt;ISO_DATE&gt;&amp;limit=10
            </code>
            <p className="text-muted-foreground">
              Returns the newest posts (up to 10). Filter by{" "}
              <code>since</code> (ISO 8601 datetime) to get only posts created
              after your last poll.
            </p>
          </div>

          {/* Published posts */}
          <div className="space-y-2">
            <p className="font-semibold">Post published trigger</p>
            <code className="block rounded bg-muted px-3 py-2 text-xs break-all">
              GET {publishedUrl}?since=&lt;ISO_DATE&gt;&amp;limit=10
            </code>
            <p className="text-muted-foreground">
              Returns recently published posts. Defaults to the last 24 hours
              when <code>since</code> is omitted.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* cURL examples */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">cURL Examples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="mb-1 font-medium">Fetch newest posts</p>
            <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
{`curl -H "x-api-key: pf_your_key_here" \\
  "${postsUrl}"`}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium">Fetch posts published in the last hour</p>
            <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
{`curl -H "x-api-key: pf_your_key_here" \\
  "${publishedUrl}?since=2024-01-01T12:00:00Z"`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Response shape */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Response Shape</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
{`{
  "posts": [
    {
      "id": "clxyz...",
      "content": "Hello world! #marketing",
      "mediaType": "NONE",
      "mediaUrls": [],
      "status": "PUBLISHED",
      "scheduledAt": "2024-01-01T10:00:00.000Z",
      "language": "en",
      "sentiment": "POSITIVE",
      "sentimentScore": 0.92,
      "createdAt": "2024-01-01T09:00:00.000Z",
      "updatedAt": "2024-01-01T10:05:00.000Z",
      "tags": [{ "id": "...", "name": "marketing", "color": "#3b82f6" }],
      "platforms": [
        {
          "platform": "FACEBOOK",
          "platformPostId": "123456789",
          "publishedUrl": "https://facebook.com/...",
          "publishedAt": "2024-01-01T10:01:00.000Z"
        }
      ]
    }
  ]
}`}
          </pre>
        </CardContent>
      </Card>

      {/* External link */}
      <p className="text-sm text-muted-foreground">
        New to Zapier?{" "}
        <a
          href="https://zapier.com/learn/zapier-quick-start-guide/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline text-primary"
        >
          Read the Zapier quick-start guide
          <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  );
}
