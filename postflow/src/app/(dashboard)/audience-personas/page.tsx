"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users2,
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

interface AudiencePersona {
  id: string;
  name: string;
  description: string | null;
  ageRange: string | null;
  primaryPlatforms: string[];
  interests: string[];
  painPoints: string[];
  goals: string[];
  contentTypes: string[];
  notes: string | null;
  createdAt: string;
}

const PLATFORMS = [
  "Facebook",
  "Instagram",
  "Twitter",
  "LinkedIn",
  "TikTok",
  "YouTube",
  "Threads",
  "Pinterest",
  "Bluesky",
];

const CONTENT_TYPES = [
  "Educational",
  "Promotional",
  "Entertaining",
  "Inspiring",
  "News",
  "Behind the Scenes",
  "User Generated",
];

function TagInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  };

  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      <div className="flex gap-1 mb-1">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder ?? `Add ${label.toLowerCase()} and press Enter`}
          className="h-7 text-xs"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} className="h-7 px-2">
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {value.map((item) => (
          <Badge key={item} variant="secondary" className="text-xs gap-1">
            {item}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== item))}
              className="hover:text-destructive"
            >
              <X className="h-2 w-2" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function MultiChipSelector({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              value.includes(opt)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:border-primary"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function PersonaForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<AudiencePersona>;
  onSave: (data: Partial<AudiencePersona>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [ageRange, setAgeRange] = useState(initial?.ageRange ?? "");
  const [primaryPlatforms, setPrimaryPlatforms] = useState<string[]>(
    initial?.primaryPlatforms ?? []
  );
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [painPoints, setPainPoints] = useState<string[]>(initial?.painPoints ?? []);
  const [goals, setGoals] = useState<string[]>(initial?.goals ?? []);
  const [contentTypes, setContentTypes] = useState<string[]>(initial?.contentTypes ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description || null,
      ageRange: ageRange || null,
      primaryPlatforms,
      interests,
      painPoints,
      goals,
      contentTypes,
      notes: notes || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground">Name *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Marketing Manager Sarah"
          required
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of this audience persona"
          rows={2}
          className="mt-1 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Age Range</Label>
        <Input
          value={ageRange}
          onChange={(e) => setAgeRange(e.target.value)}
          placeholder="e.g. 25-34"
          className="mt-1"
        />
      </div>
      <MultiChipSelector
        label="Primary Platforms"
        options={PLATFORMS}
        value={primaryPlatforms}
        onChange={setPrimaryPlatforms}
      />
      <TagInput
        label="Interests"
        value={interests}
        onChange={setInterests}
        placeholder="Add an interest and press Enter"
      />
      <TagInput
        label="Pain Points"
        value={painPoints}
        onChange={setPainPoints}
        placeholder="Add a pain point and press Enter"
      />
      <TagInput
        label="Goals"
        value={goals}
        onChange={setGoals}
        placeholder="Add a goal and press Enter"
      />
      <MultiChipSelector
        label="Preferred Content Types"
        options={CONTENT_TYPES}
        value={contentTypes}
        onChange={setContentTypes}
      />
      <div>
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional notes about this audience"
          rows={2}
          className="mt-1 text-sm"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          <span className="ml-1">Save</span>
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function AudiencePersonasPage() {
  const [personas, setPersonas] = useState<AudiencePersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/audience-personas");
      if (res.ok) {
        const data = await res.json();
        setPersonas(data.personas);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (data: Partial<AudiencePersona>) => {
    setSavingNew(true);
    try {
      const res = await fetch("/api/audience-personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { persona } = await res.json();
        setPersonas((prev) => [persona, ...prev]);
        setCreating(false);
        toast.success("Audience persona created");
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to create persona");
      }
    } finally {
      setSavingNew(false);
    }
  };

  const handleEdit = async (id: string, data: Partial<AudiencePersona>) => {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/audience-personas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { persona } = await res.json();
        setPersonas((prev) => prev.map((p) => (p.id === id ? persona : p)));
        setEditingId(null);
        toast.success("Persona updated");
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to update persona");
      }
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/audience-personas/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setPersonas((prev) => prev.filter((p) => p.id !== id));
        toast.success("Persona deleted");
      } else {
        toast.error("Failed to delete persona");
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users2 className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Audience Personas</h1>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Persona
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Define target audience profiles to guide content creation. Use personas to tailor your
        messaging and select them when creating posts.
      </p>

      {creating && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Audience Persona</CardTitle>
          </CardHeader>
          <CardContent>
            <PersonaForm
              onSave={handleCreate}
              onCancel={() => setCreating(false)}
              saving={savingNew}
            />
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : personas.length === 0 && !creating ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No audience personas yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create personas to better target your content for specific audiences.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create First Persona
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {personas.map((persona) => (
            <Card key={persona.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{persona.name}</CardTitle>
                    {persona.ageRange && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Age: {persona.ageRange}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(persona.id);
                        setExpandedId(null);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(persona.id)}
                      disabled={deletingId === persona.id}
                    >
                      {deletingId === persona.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setExpandedId(expandedId === persona.id ? null : persona.id)
                      }
                    >
                      {expandedId === persona.id ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {editingId === persona.id ? (
                  <PersonaForm
                    initial={persona}
                    onSave={(data) => handleEdit(persona.id, data)}
                    onCancel={() => setEditingId(null)}
                    saving={editSaving}
                  />
                ) : (
                  <>
                    {persona.description && (
                      <p className="text-sm text-muted-foreground mb-2">{persona.description}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mb-2">
                      {persona.primaryPlatforms.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {persona.primaryPlatforms.map((p) => (
                            <Badge key={p} variant="outline" className="text-xs">
                              {p}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {persona.contentTypes.map((ct) => (
                        <Badge key={ct} variant="secondary" className="text-xs">
                          {ct}
                        </Badge>
                      ))}
                    </div>

                    {persona.interests.length > 0 && (
                      <div className="mb-1.5">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Interests</p>
                        <div className="flex flex-wrap gap-1">
                          {persona.interests.map((i) => (
                            <span
                              key={i}
                              className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded"
                            >
                              {i}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {expandedId === persona.id && (
                      <div className="mt-2 space-y-2 border-t pt-2">
                        {persona.painPoints.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Pain Points
                            </p>
                            <ul className="text-xs text-muted-foreground space-y-0.5">
                              {persona.painPoints.map((pp) => (
                                <li key={pp} className="flex items-start gap-1">
                                  <span className="text-red-400 mt-0.5">•</span>
                                  {pp}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {persona.goals.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Goals</p>
                            <ul className="text-xs text-muted-foreground space-y-0.5">
                              {persona.goals.map((g) => (
                                <li key={g} className="flex items-start gap-1">
                                  <span className="text-green-400 mt-0.5">•</span>
                                  {g}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {persona.notes && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                            <p className="text-xs text-muted-foreground">{persona.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
