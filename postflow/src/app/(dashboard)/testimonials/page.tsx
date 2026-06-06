"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Quote,
  Plus,
  Trash2,
  FileText,
  Loader2,
  Star,
  ExternalLink,
  Image as ImageIcon,
  Check,
  X,
  Copy,
  Globe,
  Power,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Testimonial {
  id: string;
  authorName: string;
  authorTitle: string | null;
  company: string | null;
  content: string;
  rating: number | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  source: string;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TestimonialPage {
  id: string;
  slug: string;
  title: string;
  welcomeMessage: string | null;
  thankYouMessage: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i < rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

export default function TestimonialsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filterFeatured, setFilterFeatured] = useState(false);

  const [authorName, setAuthorName] = useState("");
  const [authorTitle, setAuthorTitle] = useState("");
  const [company, setCompany] = useState("");
  const [content, setContent] = useState("");
  const [rating, setRating] = useState<number | "">("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Pending review tab
  const [pendingItems, setPendingItems] = useState<Testimonial[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  // Collection pages tab
  const [pages, setPages] = useState<TestimonialPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pagesLoaded, setPagesLoaded] = useState(false);
  const [showPageForm, setShowPageForm] = useState(false);
  const [pageSlug, setPageSlug] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [pageWelcomeMessage, setPageWelcomeMessage] = useState("");
  const [pageThankYouMessage, setPageThankYouMessage] = useState("");
  const [creatingPage, setCreatingPage] = useState(false);
  const [togglingPageId, setTogglingPageId] = useState<string | null>(null);
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const qs = filterFeatured ? "?featured=true" : "";
      const res = await fetch(`/api/testimonials${qs}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as { items: Testimonial[] };
      setItems(data.items);
    } catch {
      toast.error("Failed to load testimonials");
    } finally {
      setLoading(false);
    }
  }, [filterFeatured]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await fetch("/api/testimonials?approved=false");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as { items: Testimonial[] };
      setPendingItems(data.items);
      setPendingLoaded(true);
    } catch {
      toast.error("Failed to load pending submissions");
    } finally {
      setLoadingPending(false);
    }
  }, []);

  const fetchPages = useCallback(async () => {
    setLoadingPages(true);
    try {
      const res = await fetch("/api/testimonial-pages");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as { pages: TestimonialPage[] };
      setPages(data.pages);
      setPagesLoaded(true);
    } catch {
      toast.error("Failed to load collection pages");
    } finally {
      setLoadingPages(false);
    }
  }, []);

  function resetForm() {
    setAuthorName("");
    setAuthorTitle("");
    setCompany("");
    setContent("");
    setRating("");
    setSourceUrl("");
    setImageUrl("");
  }

  async function handleSave() {
    if (!authorName.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: authorName.trim(),
          authorTitle: authorTitle.trim() || null,
          company: company.trim() || null,
          content: content.trim(),
          rating: rating === "" ? null : rating,
          sourceUrl: sourceUrl.trim() || null,
          imageUrl: imageUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to save");
      }
      toast.success("Testimonial saved");
      resetForm();
      setShowForm(false);
      await fetchItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/testimonials/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Removed");
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleFeatured(item: Testimonial) {
    setTogglingId(item.id);
    try {
      const res = await fetch(`/api/testimonials/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFeatured: !item.isFeatured }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const data = (await res.json()) as { item: Testimonial };
      setItems((prev) => prev.map((i) => (i.id === item.id ? data.item : i)));
      toast.success(data.item.isFeatured ? "Marked as featured" : "Unfeatured");
    } catch {
      toast.error("Failed to update");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleToPost(id: string) {
    setConvertingId(id);
    try {
      const res = await fetch(`/api/testimonials/${id}/to-post`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to create post");
      const data = (await res.json()) as { postId: string };
      toast.success("Draft post created");
      router.push(`/posts?highlight=${data.postId}`);
    } catch {
      toast.error("Failed to create post");
    } finally {
      setConvertingId(null);
    }
  }

  async function handleApprove(id: string) {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/testimonials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });
      if (!res.ok) throw new Error("Failed to approve");
      toast.success("Testimonial approved");
      setPendingItems((prev) => prev.filter((i) => i.id !== id));
      if (filterFeatured === false) await fetchItems();
    } catch {
      toast.error("Failed to approve");
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject(id: string) {
    setRejectingId(id);
    try {
      const res = await fetch(`/api/testimonials/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to reject");
      toast.success("Submission rejected");
      setPendingItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      toast.error("Failed to reject");
    } finally {
      setRejectingId(null);
    }
  }

  function resetPageForm() {
    setPageSlug("");
    setPageTitle("");
    setPageWelcomeMessage("");
    setPageThankYouMessage("");
  }

  async function handleCreatePage() {
    if (!pageSlug.trim() || !pageTitle.trim()) return;
    setCreatingPage(true);
    try {
      const res = await fetch("/api/testimonial-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: pageSlug.trim(),
          title: pageTitle.trim(),
          welcomeMessage: pageWelcomeMessage.trim() || null,
          thankYouMessage: pageThankYouMessage.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to create page");
      }
      const data = (await res.json()) as { page: TestimonialPage };
      setPages((prev) => [data.page, ...prev]);
      toast.success("Collection page created");
      resetPageForm();
      setShowPageForm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create page");
    } finally {
      setCreatingPage(false);
    }
  }

  async function handleTogglePageActive(page: TestimonialPage) {
    setTogglingPageId(page.id);
    try {
      const res = await fetch(`/api/testimonial-pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !page.isActive }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const data = (await res.json()) as { page: TestimonialPage };
      setPages((prev) => prev.map((p) => (p.id === page.id ? data.page : p)));
      toast.success(data.page.isActive ? "Page activated" : "Page deactivated");
    } catch {
      toast.error("Failed to update page");
    } finally {
      setTogglingPageId(null);
    }
  }

  async function handleDeletePage(id: string) {
    setDeletingPageId(id);
    try {
      const res = await fetch(`/api/testimonial-pages/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Collection page deleted");
      setPages((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast.error("Failed to delete page");
    } finally {
      setDeletingPageId(null);
    }
  }

  function handleCopyLink(slug: string) {
    const url = `${window.location.origin}/t/${slug}`;
    void navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied to clipboard"),
      () => toast.error("Failed to copy link")
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Testimonials</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Collect customer quotes and turn them into social proof posts
        </p>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Testimonials</TabsTrigger>
          <TabsTrigger
            value="pending"
            onClick={() => {
              if (!pendingLoaded) void fetchPending();
            }}
          >
            Pending Review
            {pendingLoaded && pendingItems.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {pendingItems.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="pages"
            onClick={() => {
              if (!pagesLoaded) void fetchPages();
            }}
          >
            Collection Pages
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-6 pt-4">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant={filterFeatured ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterFeatured((v) => !v)}
            >
              <Star className="h-4 w-4 mr-2" />
              Featured only
            </Button>
            <Button onClick={() => setShowForm((v) => !v)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Testimonial
            </Button>
          </div>

          {/* Add form */}
      {showForm && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Author Name *</label>
                <Input
                  placeholder="Jane Doe"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Title (optional)</label>
                <Input
                  placeholder="Marketing Director"
                  value={authorTitle}
                  onChange={(e) => setAuthorTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Company (optional)</label>
                <Input
                  placeholder="Acme Inc."
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Quote *</label>
              <Textarea
                placeholder="What did the customer say about you?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Rating (optional)</label>
                <select
                  value={rating}
                  onChange={(e) =>
                    setRating(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">No rating</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} star{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Source URL (optional)</label>
                <Input
                  placeholder="https://example.com/review"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  type="url"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Photo URL (optional)</label>
                <Input
                  placeholder="https://example.com/avatar.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  type="url"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={!authorName.trim() || !content.trim() || saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Quote className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No testimonials yet</p>
          <p className="text-sm">
            Save customer quotes and reviews to reuse them as social proof posts
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id} className="flex flex-col overflow-hidden">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 flex items-center gap-3">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.authorName}
                        className="h-10 w-10 rounded-full object-cover shrink-0"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-tight truncate">
                        {item.authorName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[item.authorTitle, item.company].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  {item.isFeatured && (
                    <Badge variant="secondary" className="shrink-0 text-xs gap-1">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      Featured
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-2 flex-1 space-y-2">
                <StarRating rating={item.rating} />
                <div className="relative">
                  <Quote className="h-4 w-4 text-muted-foreground/30 absolute -left-1 -top-1" />
                  <p className="text-sm pl-4 italic line-clamp-4">{item.content}</p>
                </div>
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline truncate"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{item.sourceUrl}</span>
                  </a>
                )}
              </CardContent>

              <CardFooter className="px-4 pb-4 pt-2 flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={convertingId === item.id}
                  onClick={() => handleToPost(item.id)}
                >
                  {convertingId === item.id ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <FileText className="h-3 w-3 mr-1" />
                  )}
                  Create Post
                </Button>
                <Button
                  size="sm"
                  variant={item.isFeatured ? "secondary" : "outline"}
                  disabled={togglingId === item.id}
                  onClick={() => handleToggleFeatured(item)}
                >
                  {togglingId === item.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Star
                      className={cn(
                        "h-3 w-3",
                        item.isFeatured && "fill-yellow-400 text-yellow-400"
                      )}
                    />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={deletingId === item.id}
                  onClick={() => handleDelete(item.id)}
                >
                  {deletingId === item.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4 pt-4">
          {loadingPending ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingItems.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Check className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No pending submissions</p>
              <p className="text-sm">
                Public testimonial submissions awaiting your review will show up here
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingItems.map((item) => (
                <Card key={item.id} className="flex flex-col overflow-hidden">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm leading-tight truncate">
                          {item.authorName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[item.authorTitle, item.company].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        Public submission
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-2 flex-1 space-y-2">
                    <StarRating rating={item.rating} />
                    <div className="relative">
                      <Quote className="h-4 w-4 text-muted-foreground/30 absolute -left-1 -top-1" />
                      <p className="text-sm pl-4 italic line-clamp-4">{item.content}</p>
                    </div>
                  </CardContent>
                  <CardFooter className="px-4 pb-4 pt-2 flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={approvingId === item.id || rejectingId === item.id}
                      onClick={() => handleApprove(item.id)}
                    >
                      {approvingId === item.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3 mr-1" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-destructive hover:text-destructive"
                      disabled={approvingId === item.id || rejectingId === item.id}
                      onClick={() => handleReject(item.id)}
                    >
                      {rejectingId === item.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <X className="h-3 w-3 mr-1" />
                      )}
                      Reject
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pages" className="space-y-4 pt-4">
          <div className="flex items-center justify-end">
            <Button size="sm" onClick={() => setShowPageForm((v) => !v)}>
              <Plus className="h-4 w-4 mr-2" />
              New Page
            </Button>
          </div>

          {showPageForm && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Slug *</label>
                    <Input
                      placeholder="my-customers"
                      value={pageSlug}
                      onChange={(e) => setPageSlug(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Lowercase letters, numbers, and hyphens — used in the public URL
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Title *</label>
                    <Input
                      placeholder="Share your experience"
                      value={pageTitle}
                      onChange={(e) => setPageTitle(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Welcome message (optional)</label>
                  <Textarea
                    placeholder="Tell visitors what this page is for..."
                    value={pageWelcomeMessage}
                    onChange={(e) => setPageWelcomeMessage(e.target.value)}
                    rows={2}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Thank you message (optional)</label>
                  <Textarea
                    placeholder="Shown after a successful submission..."
                    value={pageThankYouMessage}
                    onChange={(e) => setPageThankYouMessage(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreatePage}
                    disabled={!pageSlug.trim() || !pageTitle.trim() || creatingPage}
                  >
                    {creatingPage && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPageForm(false);
                      resetPageForm();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loadingPages ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pages.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No collection pages yet</p>
              <p className="text-sm">
                Create a public page where customers can submit their own testimonials
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pages.map((page) => (
                <Card key={page.id}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm leading-tight truncate">{page.title}</p>
                        <p className="text-xs text-muted-foreground truncate">/t/{page.slug}</p>
                      </div>
                      <Badge variant={page.isActive ? "default" : "outline"} className="shrink-0 text-xs">
                        {page.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-2">
                    {page.welcomeMessage && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{page.welcomeMessage}</p>
                    )}
                  </CardContent>
                  <CardFooter className="px-4 pb-4 pt-2 flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => handleCopyLink(page.slug)}>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy Link
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={togglingPageId === page.id}
                      onClick={() => handleTogglePageActive(page)}
                    >
                      {togglingPageId === page.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : page.isActive ? (
                        <Power className="h-3 w-3 mr-1" />
                      ) : (
                        <Globe className="h-3 w-3 mr-1" />
                      )}
                      {page.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={deletingPageId === page.id}
                      onClick={() => handleDeletePage(page.id)}
                    >
                      {deletingPageId === page.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
