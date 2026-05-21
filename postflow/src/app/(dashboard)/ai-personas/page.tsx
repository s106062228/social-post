"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Plus,
  Trash2,
  Loader2,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface AiPersona {
  id: string;
  name: string;
  description: string | null;
  writingStyle: string;
  tone: string;
  audienceDescription: string | null;
  exampleContent: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AiPersonasPage() {
  const [personas, setPersonas] = useState<AiPersona[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newWritingStyle, setNewWritingStyle] = useState("");
  const [newTone, setNewTone] = useState("professional");
  const [newAudience, setNewAudience] = useState("");
  const [newExample, setNewExample] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editWritingStyle, setEditWritingStyle] = useState("");
  const [editTone, setEditTone] = useState("");
  const [editAudience, setEditAudience] = useState("");
  const [editExample, setEditExample] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Expanded state for example content
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-personas");
      const data = (await res.json()) as { personas?: AiPersona[] };
      setPersonas(data.personas ?? []);
    } catch {
      toast.error("Failed to load personas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!newName.trim() || !newWritingStyle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ai-personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          writingStyle: newWritingStyle.trim(),
          tone: newTone,
          audienceDescription: newAudience.trim() || null,
          exampleContent: newExample.trim() || null,
        }),
      });
      const data = (await res.json()) as { persona?: AiPersona; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create persona");
      if (data.persona) setPersonas((prev) => [data.persona!, ...prev]);
      setNewName("");
      setNewDescription("");
      setNewWritingStyle("");
      setNewTone("professional");
      setNewAudience("");
      setNewExample("");
      setCreating(false);
      toast.success("Persona created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create persona");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(persona: AiPersona) {
    setEditingId(persona.id);
    setEditName(persona.name);
    setEditDescription(persona.description ?? "");
    setEditWritingStyle(persona.writingStyle);
    setEditTone(persona.tone);
    setEditAudience(persona.audienceDescription ?? "");
    setEditExample(persona.exampleContent ?? "");
  }

  async function handleEdit(id: string) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/ai-personas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          writingStyle: editWritingStyle.trim(),
          tone: editTone,
          audienceDescription: editAudience.trim() || null,
          exampleContent: editExample.trim() || null,
        }),
      });
      const data = (await res.json()) as { persona?: AiPersona; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update persona");
      if (data.persona) {
        setPersonas((prev) =>
          prev.map((p) => (p.id === id ? data.persona! : p))
        );
      }
      setEditingId(null);
      toast.success("Persona updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update persona");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/ai-personas/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete persona");
      }
      setPersonas((prev) => prev.filter((p) => p.id !== id));
      toast.success("Persona deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete persona");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">AI Writing Personas</h1>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            New Persona
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground -mt-3">
        Create reusable writing style profiles that guide AI content generation.
        Select a persona when using the AI Suggest feature in the post composer.
      </p>

      {/* Create form */}
      {creating && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Persona</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-name">Name *</Label>
                <Input
                  id="new-name"
                  placeholder="e.g. Brand Voice, Tech Expert, Friendly Coach…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-tone">Default Tone</Label>
                <select
                  id="new-tone"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newTone}
                  onChange={(e) => setNewTone(e.target.value)}
                >
                  <option value="professional">Professional</option>
                  <option value="casual">Casual</option>
                  <option value="enthusiastic">Enthusiastic</option>
                  <option value="humorous">Humorous</option>
                  <option value="informative">Informative</option>
                  <option value="inspirational">Inspirational</option>
                  <option value="authoritative">Authoritative</option>
                  <option value="empathetic">Empathetic</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-description">Description</Label>
              <Input
                id="new-description"
                placeholder="Brief description of this persona…"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-style">Writing Style *</Label>
              <Textarea
                id="new-style"
                placeholder="Describe the writing style, voice, and characteristics. e.g. 'Concise, data-driven, uses bullet points and statistics. Avoids jargon. Professional but approachable.'"
                value={newWritingStyle}
                onChange={(e) => setNewWritingStyle(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-audience">Target Audience</Label>
              <Input
                id="new-audience"
                placeholder="e.g. Small business owners, tech-savvy millennials, fitness enthusiasts…"
                value={newAudience}
                onChange={(e) => setNewAudience(e.target.value)}
                maxLength={300}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-example">Example Content</Label>
              <Textarea
                id="new-example"
                placeholder="Paste an example post that represents this persona's voice…"
                value={newExample}
                onChange={(e) => setNewExample(e.target.value)}
                rows={3}
                maxLength={1000}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                  setNewDescription("");
                  setNewWritingStyle("");
                  setNewTone("professional");
                  setNewAudience("");
                  setNewExample("");
                }}
              >
                <X className="mr-1.5 h-4 w-4" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={saving || !newName.trim() || !newWritingStyle.trim()}
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Personas list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : personas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Bot className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">No personas yet</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Create a persona to give your AI-generated content a consistent voice.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {personas.map((persona) => (
            <Card key={persona.id}>
              <CardContent className="pt-4">
                {editingId === persona.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label>Name *</Label>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={100}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Default Tone</Label>
                        <select
                          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          value={editTone}
                          onChange={(e) => setEditTone(e.target.value)}
                        >
                          <option value="professional">Professional</option>
                          <option value="casual">Casual</option>
                          <option value="enthusiastic">Enthusiastic</option>
                          <option value="humorous">Humorous</option>
                          <option value="informative">Informative</option>
                          <option value="inspirational">Inspirational</option>
                          <option value="authoritative">Authoritative</option>
                          <option value="empathetic">Empathetic</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Description</Label>
                      <Input
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        maxLength={500}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Writing Style *</Label>
                      <Textarea
                        value={editWritingStyle}
                        onChange={(e) => setEditWritingStyle(e.target.value)}
                        rows={3}
                        maxLength={500}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Target Audience</Label>
                      <Input
                        value={editAudience}
                        onChange={(e) => setEditAudience(e.target.value)}
                        maxLength={300}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Example Content</Label>
                      <Textarea
                        value={editExample}
                        onChange={(e) => setEditExample(e.target.value)}
                        rows={3}
                        maxLength={1000}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="mr-1.5 h-4 w-4" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleEdit(persona.id)}
                        disabled={editSaving || !editName.trim() || !editWritingStyle.trim()}
                      >
                        {editSaving ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-1.5 h-4 w-4" />
                        )}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{persona.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {persona.tone}
                          </Badge>
                        </div>
                        {persona.description && (
                          <p className="text-xs text-muted-foreground">{persona.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => startEdit(persona)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(persona.id)}
                          disabled={deletingId === persona.id}
                        >
                          {deletingId === persona.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground/70">Style: </span>
                      {persona.writingStyle.length > 120
                        ? `${persona.writingStyle.slice(0, 120)}…`
                        : persona.writingStyle}
                    </div>
                    {persona.audienceDescription && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70">Audience: </span>
                        {persona.audienceDescription}
                      </div>
                    )}
                    {persona.exampleContent && (
                      <div>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() =>
                            setExpandedId(expandedId === persona.id ? null : persona.id)
                          }
                        >
                          {expandedId === persona.id ? (
                            <>
                              <ChevronUp className="h-3 w-3" />
                              Hide example
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" />
                              Show example
                            </>
                          )}
                        </button>
                        {expandedId === persona.id && (
                          <p className="mt-1.5 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground italic">
                            {persona.exampleContent}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
