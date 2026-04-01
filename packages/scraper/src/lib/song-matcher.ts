import type { SongFormation } from "../types/models.js";

function normalize(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/[「」『』""〝〟（）()【】\[\]]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

function stripParens(title: string): string {
  return title.replace(/[（(][^）)]*[）)]/g, "").trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }

  return dp[m]![n]!;
}

export type MatchResult = {
  songTitle: string;
  formation: SongFormation;
  matchType: "exact" | "normalized" | "stripped" | "fuzzy";
};

export function matchFormations(
  songTitles: string[],
  formations: Map<string, SongFormation>
): Map<string, MatchResult> {
  const result = new Map<string, MatchResult>();
  const usedKeys = new Set<string>();

  const formationEntries = [...formations.entries()];

  for (const songTitle of songTitles) {
    const normalizedSong = normalize(songTitle);
    const strippedSong = normalize(stripParens(songTitle));

    // Pass 1: exact match on normalized key
    for (const [key, formation] of formationEntries) {
      if (usedKeys.has(key)) continue;
      if (normalize(key) === normalizedSong) {
        result.set(songTitle, { songTitle, formation, matchType: "normalized" });
        usedKeys.add(key);
        break;
      }
    }
    if (result.has(songTitle)) continue;

    // Pass 2: stripped parens match
    for (const [key, formation] of formationEntries) {
      if (usedKeys.has(key)) continue;
      if (normalize(stripParens(key)) === strippedSong) {
        result.set(songTitle, { songTitle, formation, matchType: "stripped" });
        usedKeys.add(key);
        break;
      }
    }
    if (result.has(songTitle)) continue;

    // Pass 3: fuzzy match (Levenshtein distance <= 3)
    let bestDist = Infinity;
    let bestKey = "";
    let bestFormation: SongFormation | null = null;

    for (const [key, formation] of formationEntries) {
      if (usedKeys.has(key)) continue;
      const dist = levenshtein(normalizedSong, normalize(key));
      if (dist < bestDist && dist <= 3) {
        bestDist = dist;
        bestKey = key;
        bestFormation = formation;
      }
    }

    if (bestFormation && bestKey) {
      result.set(songTitle, { songTitle, formation: bestFormation, matchType: "fuzzy" });
      usedKeys.add(bestKey);
    }
  }

  return result;
}
