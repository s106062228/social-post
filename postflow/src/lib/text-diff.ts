// Word-level diff between two strings.
// Uses a longest-common-subsequence (LCS) approach to produce a minimal edit sequence.

export type DiffChunkType = "added" | "removed" | "unchanged";

export interface DiffChunk {
  type: DiffChunkType;
  text: string;
}

function tokenize(text: string): string[] {
  // Split preserving whitespace as separate tokens so reconstruction is lossless
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

// Build LCS length table using dynamic programming
function buildLcsTable(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

// Backtrack through the LCS table to produce raw diff operations
function backtrack(
  dp: number[][],
  a: string[],
  b: string[],
  i: number,
  j: number,
  chunks: DiffChunk[]
): void {
  if (i === 0 && j === 0) return;

  if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
    backtrack(dp, a, b, i - 1, j - 1, chunks);
    chunks.push({ type: "unchanged", text: a[i - 1] });
  } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
    backtrack(dp, a, b, i, j - 1, chunks);
    chunks.push({ type: "added", text: b[j - 1] });
  } else {
    backtrack(dp, a, b, i - 1, j, chunks);
    chunks.push({ type: "removed", text: a[i - 1] });
  }
}

// Merge consecutive chunks of the same type
function mergeChunks(chunks: DiffChunk[]): DiffChunk[] {
  const result: DiffChunk[] = [];
  for (const chunk of chunks) {
    if (result.length > 0 && result[result.length - 1].type === chunk.type) {
      result[result.length - 1] = {
        type: chunk.type,
        text: result[result.length - 1].text + chunk.text,
      };
    } else {
      result.push({ ...chunk });
    }
  }
  return result;
}

/**
 * Compute a word-level diff between `before` and `after`.
 * Returns merged chunks suitable for rendering a highlighted diff view.
 */
export function computeDiff(before: string, after: string): DiffChunk[] {
  if (before === after) {
    return before.length > 0 ? [{ type: "unchanged", text: before }] : [];
  }

  const aTokens = tokenize(before);
  const bTokens = tokenize(after);

  if (aTokens.length === 0) {
    return after.length > 0 ? [{ type: "added", text: after }] : [];
  }
  if (bTokens.length === 0) {
    return before.length > 0 ? [{ type: "removed", text: before }] : [];
  }

  const dp = buildLcsTable(aTokens, bTokens);
  const raw: DiffChunk[] = [];
  backtrack(dp, aTokens, bTokens, aTokens.length, bTokens.length, raw);
  return mergeChunks(raw);
}

/**
 * Summarise a diff as `{added, removed, unchanged}` word counts.
 */
export function diffStats(chunks: DiffChunk[]): {
  added: number;
  removed: number;
  unchanged: number;
} {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const chunk of chunks) {
    const words = chunk.text.trim().split(/\s+/).filter(Boolean).length;
    if (chunk.type === "added") added += words;
    else if (chunk.type === "removed") removed += words;
    else unchanged += words;
  }
  return { added, removed, unchanged };
}
