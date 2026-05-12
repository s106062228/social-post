"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp, Copy, Check, ExternalLink, Code2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OpenAPISpec } from "@/lib/openapi";

const METHOD_COLORS: Record<string, string> = {
  get: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  post: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  put: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  patch: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  delete: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

interface EndpointMethod {
  method: string;
  path: string;
  tags: string[];
  summary: string;
  description?: string;
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  security?: unknown[];
}

function buildCurl(method: string, path: string, baseUrl: string): string {
  const url = `${baseUrl}${path}`;
  const methodFlag = method.toUpperCase() === "GET" ? "" : ` -X ${method.toUpperCase()}`;
  return `curl${methodFlag} "${url}" \\\n  -H "Cookie: next-auth.session-token=<your-token>"`;
}

function EndpointCard({ endpoint, baseUrl }: { endpoint: EndpointMethod; baseUrl: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const curlCmd = buildCurl(endpoint.method, endpoint.path, baseUrl);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(curlCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded font-mono w-16 text-center ${METHOD_COLORS[endpoint.method] ?? "bg-muted text-muted-foreground"}`}>
          {endpoint.method}
        </span>
        <code className="text-sm font-mono text-foreground flex-1">{endpoint.path}</code>
        <span className="text-sm text-muted-foreground hidden sm:block">{endpoint.summary}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t bg-muted/20 p-4 space-y-4">
          {endpoint.description && (
            <p className="text-sm text-muted-foreground">{endpoint.description}</p>
          )}

          {endpoint.security && Array.isArray(endpoint.security) && endpoint.security.some((s) => Object.keys(s as Record<string, unknown>).includes("apiKeyAuth")) && (
            <Badge variant="outline" className="text-xs">API Key auth</Badge>
          )}

          {endpoint.parameters && Array.isArray(endpoint.parameters) && endpoint.parameters.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Parameters</p>
              <div className="space-y-1">
                {(endpoint.parameters as Array<{ name: string; in: string; required?: boolean; schema?: { type?: string; enum?: string[]; default?: unknown }; description?: string }>).map((p) => (
                  <div key={p.name} className="flex items-start gap-2 text-sm">
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">{p.name}</code>
                    <span className="text-muted-foreground text-xs">{p.in}</span>
                    {p.required && <Badge variant="destructive" className="text-xs py-0">required</Badge>}
                    {p.schema?.type && <span className="text-xs text-muted-foreground">{p.schema.type}</span>}
                    {p.description && <span className="text-xs text-muted-foreground">— {p.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">cURL Example</p>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={handleCopy}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <pre className="text-xs bg-muted rounded p-3 overflow-x-auto font-mono text-foreground">{curlCmd}</pre>
          </div>

          {endpoint.responses && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Responses</p>
              <div className="space-y-1">
                {Object.entries(endpoint.responses as Record<string, { description?: string }>).map(([code, resp]) => (
                  <div key={code} className="flex items-center gap-2 text-sm">
                    <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${code.startsWith("2") ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : code.startsWith("4") ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" : "bg-muted text-muted-foreground"}`}>
                      {code}
                    </span>
                    <span className="text-muted-foreground text-xs">{resp.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApiDocsPage() {
  const [spec, setSpec] = useState<OpenAPISpec | null>(null);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/openapi.json")
      .then((r) => r.json())
      .then((data: OpenAPISpec) => {
        setSpec(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const endpoints = useMemo<EndpointMethod[]>(() => {
    if (!spec) return [];
    const result: EndpointMethod[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(pathItem as Record<string, unknown>)) {
        if (["get", "post", "put", "patch", "delete"].includes(method)) {
          const operation = op as {
            tags?: string[];
            summary?: string;
            description?: string;
            parameters?: unknown[];
            requestBody?: unknown;
            responses?: Record<string, unknown>;
            security?: unknown[];
          };
          result.push({
            method,
            path,
            tags: operation.tags ?? [],
            summary: operation.summary ?? "",
            description: operation.description,
            parameters: operation.parameters,
            requestBody: operation.requestBody,
            responses: operation.responses,
            security: operation.security,
          });
        }
      }
    }
    return result;
  }, [spec]);

  const filtered = useMemo(() => {
    return endpoints.filter((e) => {
      const matchesTag = !activeTag || e.tags.includes(activeTag);
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        e.path.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q);
      return matchesTag && matchesSearch;
    });
  }, [endpoints, search, activeTag]);

  const grouped = useMemo(() => {
    const map = new Map<string, EndpointMethod[]>();
    for (const ep of filtered) {
      const tag = ep.tags[0] ?? "Other";
      const arr = map.get(tag) ?? [];
      arr.push(ep);
      map.set(tag, arr);
    }
    return map;
  }, [filtered]);

  const baseUrl = spec?.servers?.[0]?.url ?? "";

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <span className="text-muted-foreground">Loading API docs…</span>
      </div>
    );
  }

  if (!spec) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Failed to load API specification.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Code2 className="h-6 w-6" />
          <h1 className="text-2xl font-bold">{spec.info.title}</h1>
          <Badge variant="secondary">v{spec.info.version}</Badge>
        </div>
        <p className="text-muted-foreground text-sm max-w-2xl">{spec.info.description}</p>
        <a
          href="/api/openapi.json"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Download OpenAPI JSON
        </a>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Authentication</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Session cookie:</strong> Standard browser authentication via NextAuth.js. Use when building UI integrations.
          </p>
          <p>
            <strong className="text-foreground">API key:</strong> Pass your personal API key in the <code className="font-mono text-xs bg-muted px-1 rounded">x-api-key</code> header for server-to-server integrations (Zapier, etc.). Generate keys at{" "}
            <a href="/api-keys" className="text-primary hover:underline">Settings → API Keys</a>.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search endpoints…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            variant={activeTag === null ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTag(null)}
          >
            All
          </Button>
          {spec.tags?.map((t) => (
            <Button
              key={t.name}
              variant={activeTag === t.name ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTag(activeTag === t.name ? null : t.name)}
            >
              {t.name}
            </Button>
          ))}
        </div>
      </div>

      {grouped.size === 0 ? (
        <p className="text-muted-foreground text-sm">No endpoints match your search.</p>
      ) : (
        Array.from(grouped.entries()).map(([tag, eps]) => (
          <div key={tag} className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{tag}</h2>
              <Badge variant="secondary" className="text-xs">{eps.length}</Badge>
            </div>
            {spec.tags?.find((t) => t.name === tag)?.description && (
              <p className="text-sm text-muted-foreground">{spec.tags.find((t) => t.name === tag)?.description}</p>
            )}
            <div className="space-y-2">
              {eps.map((ep) => (
                <EndpointCard key={`${ep.method}-${ep.path}`} endpoint={ep} baseUrl={baseUrl} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
