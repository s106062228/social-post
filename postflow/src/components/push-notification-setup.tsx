"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type Status = "unsupported" | "loading" | "disabled" | "enabled" | "denied";

export function PushNotificationSetup() {
  const [status, setStatus] = useState<Status>("loading");
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    fetch("/api/push/vapid-key")
      .then((r) => r.json())
      .then((data: { enabled: boolean; publicKey: string | null }) => {
        if (!data.enabled || !data.publicKey) {
          setStatus("unsupported");
          return;
        }
        setVapidKey(data.publicKey);

        const perm = Notification.permission;
        if (perm === "denied") {
          setStatus("denied");
          return;
        }

        navigator.serviceWorker.ready.then((reg) => {
          reg.pushManager.getSubscription().then((sub) => {
            setStatus(sub ? "enabled" : "disabled");
          });
        });
      })
      .catch(() => setStatus("unsupported"));
  }, []);

  async function enable() {
    if (!vapidKey) return;
    setWorking(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("denied");
        toast({ title: "Permission denied", description: "Notification permission denied", variant: "destructive" });
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dhKey: json.keys?.p256dh ?? "",
          authKey: json.keys?.auth ?? "",
          userAgent: navigator.userAgent.slice(0, 500),
        }),
      });

      setStatus("enabled");
      toast({ title: "Notifications enabled", description: "You'll receive browser push notifications." });
    } catch {
      toast({ title: "Error", description: "Failed to enable notifications.", variant: "destructive" });
    } finally {
      setWorking(false);
    }
  }

  async function disable() {
    setWorking(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("disabled");
      toast({ title: "Notifications disabled", description: "You'll no longer receive browser push notifications." });
    } catch {
      toast({ title: "Error", description: "Failed to disable notifications.", variant: "destructive" });
    } finally {
      setWorking(false);
    }
  }

  if (status === "unsupported") {
    return (
      <p className="text-sm text-muted-foreground">
        Browser push notifications are not supported or not configured.
      </p>
    );
  }

  if (status === "loading") {
    return <p className="text-sm text-muted-foreground">Checking notification support…</p>;
  }

  if (status === "denied") {
    return (
      <p className="text-sm text-destructive">
        Notifications are blocked in your browser. Enable them in browser settings then reload.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <p className="text-sm text-muted-foreground flex-1">
        {status === "enabled"
          ? "Push notifications are enabled for this browser."
          : "Enable push notifications to get instant alerts for post events."}
      </p>
      {status === "enabled" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={disable}
          disabled={working}
          className="gap-2"
        >
          <BellOff className="h-4 w-4" />
          Disable
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={enable}
          disabled={working}
          className="gap-2"
        >
          <Bell className="h-4 w-4" />
          Enable
        </Button>
      )}
    </div>
  );
}
