"use client";

interface AuditScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

function scoreColor(score: number): string {
  if (score >= 75) return "#22c55e"; // green-500
  if (score >= 50) return "#eab308"; // yellow-500
  return "#ef4444"; // red-500
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

function scoreLabel(score: number): string {
  if (score >= 75) return "Strong";
  if (score >= 50) return "Average";
  return "Needs Work";
}

export function AuditScoreRing({
  score,
  size = 160,
  strokeWidth = 14,
}: AuditScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, score));
  const dashOffset = circumference * (1 - progress / 100);
  const color = scoreColor(score);
  const grade = gradeFromScore(score);
  const label = scoreLabel(score);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Audit score: ${score} out of 100`}
      >
        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Progress ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        {/* Score text */}
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.22}
          fontWeight="700"
          fill={color}
        >
          {score}
        </text>
        {/* Grade */}
        <text
          x={cx}
          y={cy + size * 0.13}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.14}
          fontWeight="600"
          fill={color}
        >
          {grade}
        </text>
      </svg>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}
