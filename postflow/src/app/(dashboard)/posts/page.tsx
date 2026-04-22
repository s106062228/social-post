import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PostStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Download, Plus } from "lucide-react";
import { SearchInput } from "./search-input";
import { PostsListClient } from "./posts-list-client";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; search?: string; tag?: string }>;
}) {
  const session = await auth();
  const userId = session!.user!.id;

  const { status: statusFilter, page: pageStr, search: searchQuery, tag: tagFilter } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const limit = 20;
  const skip = (page - 1) * limit;

  const statusEnum = statusFilter as PostStatus | undefined;
  const search = searchQuery?.trim() ?? "";

  const where = {
    userId,
    ...(statusEnum && Object.values(PostStatus).includes(statusEnum)
      ? { status: statusEnum }
      : {}),
    ...(search ? { content: { contains: search, mode: "insensitive" as const } } : {}),
    ...(tagFilter ? { tags: { some: { tagId: tagFilter } } } : {}),
  };

  const [posts, total, userTags] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        publishResults: {
          select: { platform: true, status: true, publishedUrl: true },
        },
        tags: {
          select: {
            tag: { select: { id: true, name: true, color: true } },
          },
        },
      },
    }),
    prisma.post.count({ where }),
    prisma.tag.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  const statuses: Array<{ value: string; label: string }> = [
    { value: "", label: "All" },
    { value: "DRAFT", label: "Draft" },
    { value: "SCHEDULED", label: "Scheduled" },
    { value: "PUBLISHED", label: "Published" },
    { value: "FAILED", label: "Failed" },
  ];

  function buildHref(opts: { status?: string; page?: number; search?: string; tag?: string }) {
    const params = new URLSearchParams();
    const s = opts.status ?? statusFilter ?? "";
    if (s) params.set("status", s);
    const q = opts.search !== undefined ? opts.search : search;
    if (q) params.set("search", q);
    const t = opts.tag !== undefined ? opts.tag : (tagFilter ?? "");
    if (t) params.set("tag", t);
    const p = opts.page ?? page;
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/posts${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Posts</h1>
          <p className="text-muted-foreground">
            Manage and track all your posts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link
              href={`/api/posts/export${
                (() => {
                  const p = new URLSearchParams();
                  if (statusFilter) p.set("status", statusFilter);
                  if (search) p.set("search", search);
                  const qs = p.toString();
                  return qs ? `?${qs}` : "";
                })()
              }`}
              download="posts-export.csv"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Link>
          </Button>
          <Button asChild>
            <Link href="/posts/new">
              <Plus className="mr-2 h-4 w-4" />
              New post
            </Link>
          </Button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {statuses.map(({ value, label }) => {
          const isActive = (statusFilter ?? "") === value;
          const href = buildHref({ status: value, page: 1 });
          return (
            <Link
              key={value}
              href={href}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Keyword search + tag filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput defaultValue={search} />
        {userTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Tag:</span>
            <Link
              href={buildHref({ tag: "", page: 1 })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                !tagFilter
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground hover:bg-accent"
              }`}
            >
              All
            </Link>
            {userTags.map((tag) => {
              const isTagActive = tagFilter === tag.id;
              return (
                <Link
                  key={tag.id}
                  href={buildHref({ tag: isTagActive ? "" : tag.id, page: 1 })}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isTagActive
                      ? "text-white"
                      : "border border-input text-muted-foreground hover:bg-accent"
                  }`}
                  style={isTagActive ? { backgroundColor: tag.color } : undefined}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Posts list */}
      <Card>
        <CardHeader>
          <CardTitle>{total} post{total !== 1 ? "s" : ""}</CardTitle>
          {(statusFilter || search || tagFilter) && (
            <CardDescription>
              {[
                statusFilter && `Status: ${statusFilter.toLowerCase()}`,
                search && `Search: "${search}"`,
                tagFilter && `Tag: ${userTags.find((t) => t.id === tagFilter)?.name ?? tagFilter}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <PostsListClient posts={posts} />
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildHref({ page: page - 1 })}>Previous</Link>
            </Button>
          )}
          <span className="flex items-center text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildHref({ page: page + 1 })}>Next</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
