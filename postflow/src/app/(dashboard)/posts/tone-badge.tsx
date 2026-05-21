const TONE_COLORS: Record<string, string> = {
  professional: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  casual: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  humorous: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  inspirational: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  educational: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  friendly: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  authoritative: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
};

interface ToneBadgeProps {
  tone: string;
}

export function ToneBadge({ tone }: ToneBadgeProps) {
  const colorClass =
    TONE_COLORS[tone] ??
    "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  const label = tone.charAt(0).toUpperCase() + tone.slice(1);
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}
