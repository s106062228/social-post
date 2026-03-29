"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface OAuthConnectProps {
  isConnected: boolean;
}

export function OAuthConnect({ isConnected }: OAuthConnectProps) {
  const [loading, setLoading] = useState(false);

  const handleConnect = () => {
    setLoading(true);
    // Redirect to OAuth connect endpoint — server will redirect to Meta
    window.location.href = "/api/oauth/meta/connect";
  };

  if (isConnected) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
        Connected
      </span>
    );
  }

  return (
    <Button onClick={handleConnect} disabled={loading} size="sm">
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Connect Meta
    </Button>
  );
}
