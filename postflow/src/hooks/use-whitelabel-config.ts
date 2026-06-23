"use client";

import { useState, useEffect } from "react";

export interface WhitelabelConfig {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  emailSignature: string | null;
  faviconUrl: string | null;
}

const DEFAULT_CONFIG: WhitelabelConfig = {
  appName: "PostFlow",
  logoUrl: null,
  primaryColor: "#6366f1",
  accentColor: "#8b5cf6",
  emailSignature: null,
  faviconUrl: null,
};

let cachedConfig: WhitelabelConfig | null = null;

export function useWhitelabelConfig() {
  const [config, setConfig] = useState<WhitelabelConfig>(cachedConfig ?? DEFAULT_CONFIG);
  const [loading, setLoading] = useState(!cachedConfig);

  useEffect(() => {
    if (cachedConfig) return;

    void (async () => {
      try {
        const res = await fetch("/api/whitelabel");
        if (!res.ok) return;
        const data = (await res.json()) as WhitelabelConfig;
        cachedConfig = data;
        setConfig(data);
      } catch {
        // silently use defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { config, loading };
}
