"use client";

import { useState, useCallback } from "react";
import { TrendingUp } from "lucide-react";
import { LogConversionDialog } from "@/components/log-conversion-dialog";

interface LogConversionButtonProps {
  postId: string;
  initialCount?: number;
}

export function LogConversionButton({
  postId,
  initialCount = 0,
}: LogConversionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState(initialCount);

  const handleLogged = useCallback(() => {
    setCount((prev) => prev + 1);
  }, []);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        title="Log conversion"
        className="relative rounded p-1 text-gray-400 transition-colors hover:text-indigo-600 hover:bg-indigo-50"
      >
        <TrendingUp className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white leading-none">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {isOpen && (
        <LogConversionDialog
          postId={postId}
          onLogged={handleLogged}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
