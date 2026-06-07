"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ChevronUp, ChevronDown, Pencil, Trash2, Plus, Check, X, Tags } from "lucide-react";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "url", label: "URL" },
  { value: "select", label: "Select (dropdown)" },
] as const;

type FieldType = (typeof FIELD_TYPES)[number]["value"];

type CustomField = {
  id: string;
  key: string;
  label: string;
  fieldType: FieldType;
  options: string[];
  defaultValue: string | null;
  isRequired: boolean;
  isActive: boolean;
  order: number;
};

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 50);
}

export default function CustomFieldsPage() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Create form state
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const [newOptions, setNewOptions] = useState("");
  const [newDefault, setNewDefault] = useState("");
  const [newRequired, setNewRequired] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editType, setEditType] = useState<FieldType>("text");
  const [editOptions, setEditOptions] = useState("");
  const [editDefault, setEditDefault] = useState("");
  const [editRequired, setEditRequired] = useState(false);
  const [editActive, setEditActive] = useState(true);

  async function fetchFields() {
    setLoading(true);
    try {
      const res = await fetch("/api/custom-fields");
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { fields: CustomField[] };
      setFields(data.fields);
    } catch {
      toast({ title: "Failed to load custom fields", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchFields();
  }, []);

  function handleLabelChange(label: string) {
    setNewLabel(label);
    setNewKey(slugify(label));
  }

  function createField() {
    if (!newLabel.trim()) {
      toast({ title: "Label is required", variant: "destructive" });
      return;
    }
    if (!newKey.trim()) {
      toast({ title: "Key is required", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        const options =
          newType === "select"
            ? newOptions
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        const res = await fetch("/api/custom-fields", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: newLabel.trim(),
            key: newKey.trim(),
            fieldType: newType,
            options,
            defaultValue: newDefault.trim() || null,
            isRequired: newRequired,
            order: fields.length,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Create failed");
        }
        toast({ title: "Custom field created", variant: "success" });
        setNewLabel("");
        setNewKey("");
        setNewType("text");
        setNewOptions("");
        setNewDefault("");
        setNewRequired(false);
        setCreating(false);
        await fetchFields();
      } catch (err) {
        toast({
          title: "Failed to create field",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function startEdit(field: CustomField) {
    setEditingId(field.id);
    setEditLabel(field.label);
    setEditType(field.fieldType);
    setEditOptions(field.options.join(", "));
    setEditDefault(field.defaultValue ?? "");
    setEditRequired(field.isRequired);
    setEditActive(field.isActive);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function updateField(id: string) {
    if (!editLabel.trim()) {
      toast({ title: "Label is required", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        const options =
          editType === "select"
            ? editOptions
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        const res = await fetch(`/api/custom-fields/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: editLabel.trim(),
            fieldType: editType,
            options,
            defaultValue: editDefault.trim() || null,
            isRequired: editRequired,
            isActive: editActive,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Update failed");
        }
        toast({ title: "Field updated", variant: "success" });
        cancelEdit();
        await fetchFields();
      } catch (err) {
        toast({
          title: "Failed to update field",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function deleteField(id: string, label: string) {
    if (!confirm(`Delete custom field "${label}"? All saved values will be removed.`)) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/custom-fields/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Delete failed");
        }
        toast({ title: "Field deleted", variant: "success" });
        await fetchFields();
      } catch (err) {
        toast({
          title: "Failed to delete field",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  async function moveField(id: string, direction: "up" | "down") {
    const index = fields.findIndex((f) => f.id === id);
    if (index === -1) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= fields.length) return;

    const current = fields[index];
    const swap = fields[swapIndex];
    startTransition(async () => {
      try {
        await Promise.all([
          fetch(`/api/custom-fields/${current.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: swap.order }),
          }),
          fetch(`/api/custom-fields/${swap.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: current.order }),
          }),
        ]);
        await fetchFields();
      } catch {
        toast({ title: "Failed to reorder fields", variant: "destructive" });
      }
    });
  }

  const fieldTypeBadge = (type: FieldType) => {
    const colors: Record<FieldType, string> = {
      text: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      number: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
      date: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
      url: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
      select: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    };
    return (
      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${colors[type]}`}>
        {type}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Tags className="h-6 w-6" />
            Custom Fields
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define custom metadata fields to track campaign codes, product IDs, and other business data on posts
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Field
          </Button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="font-medium">New Custom Field</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Label *</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="e.g. Campaign Code"
                maxLength={100}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Key (auto-derived) *</label>
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.replace(/[^a-z0-9_]/g, ""))}
                placeholder="campaign_code"
                maxLength={50}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Type *</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as FieldType)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Default Value</label>
              <input
                type="text"
                value={newDefault}
                onChange={(e) => setNewDefault(e.target.value)}
                placeholder="Optional default"
                maxLength={500}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {newType === "select" && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Options (comma-separated)
              </label>
              <input
                type="text"
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                placeholder="Option 1, Option 2, Option 3"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={newRequired}
              onChange={(e) => setNewRequired(e.target.checked)}
              className="rounded"
            />
            Required field
          </label>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={createField} disabled={isPending}>
              <Check className="mr-1 h-3 w-3" />
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setNewLabel("");
                setNewKey("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Field list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : fields.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Tags className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No custom fields yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create fields like &ldquo;Campaign Code&rdquo;, &ldquo;Product SKU&rdquo;, or &ldquo;Client Name&rdquo;
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className={`rounded-lg border bg-card p-3 ${!field.isActive ? "opacity-50" : ""}`}
            >
              {editingId === field.id ? (
                /* Edit form */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Label</label>
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        maxLength={100}
                        className="w-full rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Type</label>
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value as FieldType)}
                        className="w-full rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {editType === "select" && (
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Options (comma-separated)</label>
                      <input
                        type="text"
                        value={editOptions}
                        onChange={(e) => setEditOptions(e.target.value)}
                        className="w-full rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Default Value</label>
                      <input
                        type="text"
                        value={editDefault}
                        onChange={(e) => setEditDefault(e.target.value)}
                        className="w-full rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div className="flex flex-col gap-2 pt-4">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={editRequired}
                          onChange={(e) => setEditRequired(e.target.checked)}
                        />
                        Required
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={editActive}
                          onChange={(e) => setEditActive(e.target.checked)}
                        />
                        Active
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateField(field.id)} disabled={isPending}>
                      <Check className="mr-1 h-3 w-3" />
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="mr-1 h-3 w-3" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                /* Display row */
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{field.label}</span>
                      <code className="rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">
                        {`{{${field.key}}}`}
                      </code>
                      {fieldTypeBadge(field.fieldType)}
                      {field.isRequired && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                          required
                        </span>
                      )}
                      {!field.isActive && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                          inactive
                        </span>
                      )}
                    </div>
                    {field.fieldType === "select" && field.options.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Options: {field.options.slice(0, 5).join(", ")}
                        {field.options.length > 5 && ` +${field.options.length - 5} more`}
                      </p>
                    )}
                    {field.defaultValue && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Default: {field.defaultValue}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveField(field.id, "up")}
                      disabled={index === 0 || isPending}
                      title="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveField(field.id, "down")}
                      disabled={index === fields.length - 1 || isPending}
                      title="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(field)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteField(field.id, field.label)}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {fields.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Custom fields appear in the post composer when creating or editing posts.
          Filter posts by custom field values using the URL param{" "}
          <code className="rounded bg-muted px-1 text-xs">?customField[key]=value</code>
        </p>
      )}
    </div>
  );
}
