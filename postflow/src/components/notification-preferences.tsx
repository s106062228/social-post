"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

interface NotificationPref {
  type: string;
  label: string;
  inApp: boolean;
  email: boolean;
}

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notification-preferences")
      .then((r) => r.json())
      .then((data: unknown) => {
        const d = data as { preferences: NotificationPref[] };
        setPreferences(d.preferences);
      })
      .catch(() => {
        toast({
          title: "Failed to load notification preferences",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  async function togglePref(
    type: string,
    channel: "inApp" | "email",
    newValue: boolean
  ) {
    const updated = preferences.map((p: NotificationPref) =>
      p.type === type ? { ...p, [channel]: newValue } : p
    );
    setPreferences(updated);

    const pref = updated.find((p: NotificationPref) => p.type === type)!;
    setSaving(type);
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: [{ type, inApp: pref.inApp, email: pref.email }],
        }),
      });

      if (!res.ok) {
        // Revert on error
        setPreferences(preferences);
        throw new Error("Failed to save");
      }
    } catch {
      toast({
        title: "Failed to save preference",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>
            Control which events trigger in-app and email notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>
          Control which events trigger in-app and email notifications.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left font-medium text-muted-foreground">
                  Event
                </th>
                <th className="pb-2 text-center font-medium text-muted-foreground w-24">
                  In-App
                </th>
                <th className="pb-2 text-center font-medium text-muted-foreground w-24">
                  Email
                </th>
              </tr>
            </thead>
            <tbody>
              {preferences.map((pref) => (
                <tr key={pref.type} className="border-b last:border-0">
                  <td className="py-3 pr-4">{pref.label}</td>
                  <td className="py-3 text-center">
                    <input
                      type="checkbox"
                      checked={pref.inApp}
                      disabled={saving === pref.type}
                      onChange={(e) =>
                        togglePref(pref.type, "inApp", e.target.checked)
                      }
                      className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer disabled:cursor-wait"
                      aria-label={`${pref.label} in-app`}
                    />
                  </td>
                  <td className="py-3 text-center">
                    <input
                      type="checkbox"
                      checked={pref.email}
                      disabled={saving === pref.type}
                      onChange={(e) =>
                        togglePref(pref.type, "email", e.target.checked)
                      }
                      className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer disabled:cursor-wait"
                      aria-label={`${pref.label} email`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Email notifications also require the global &quot;Email Notifications&quot; toggle
          to be enabled above.
        </p>
      </CardContent>
    </Card>
  );
}
