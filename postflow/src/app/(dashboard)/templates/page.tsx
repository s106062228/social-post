import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LayoutTemplate } from "lucide-react";
import { DeleteTemplateButton } from "./delete-template-button";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  const userId = session!.user!.id;

  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const limit = 20;
  const skip = (page - 1) * limit;

  const [templates, total] = await Promise.all([
    prisma.template.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.template.count({ where: { userId } }),
  ]);

  const totalPages = Math.ceil(total / limit);

  function buildHref(p: number) {
    return `/templates${p > 1 ? `?page=${p}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
          <p className="text-muted-foreground">
            Reusable content templates for quick post creation.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {total} template{total !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <LayoutTemplate className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No templates yet</p>
              <p className="text-xs text-muted-foreground">
                Use the &ldquo;Save as Template&rdquo; button on any post to create one.
              </p>
              <Button size="sm" asChild>
                <Link href="/posts">Go to Posts</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{template.name}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {template.content}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(template.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <DeleteTemplateButton templateId={template.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildHref(page - 1)}>Previous</Link>
            </Button>
          )}
          <span className="flex items-center text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildHref(page + 1)}>Next</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
