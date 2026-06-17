/**
 * Pure familiarity analyzer (core-destined).
 * Inputs: author identity, touched paths, and a history source.
 */

import type { AuthorIdentity } from "../inputs/changedFiles.js";
import type { GitHistorySource } from "../inputs/gitHistorySource.js";
import { historyWindowSince } from "../inputs/gitHistorySource.js";

export interface FamiliarityFinding {
  area: string;
  authorCommitCount: number;
  totalAreaCommitCount: number;
  lastTouchDate: Date | null;
  shareOfAreaChurn: number;
  characterization: "high" | "moderate" | "none";
}

export interface FamiliarityInput {
  author: AuthorIdentity;
  touchedPaths: readonly string[];
  historySource: GitHistorySource;
}

/**
 * Slice 1: count an author's commits to a single touched file over the
 * 6-month history window. Pure — no git shell-out; uses the injected source.
 */
export function countAuthorCommitsToFile(
  author: AuthorIdentity,
  touchedPath: string,
  historySource: GitHistorySource,
  asOf: Date = new Date()
): number {
  const stats = historySource.query({
    authorEmail: author.email,
    path: touchedPath,
    since: historyWindowSince(asOf),
  });
  return stats.authorCommitCount;
}

/** Map a touched file path to its containing directory area for aggregation. */
export function touchedAreaForPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return ".";
  }
  return normalized.slice(0, lastSlash + 1);
}

/**
 * Slice 2: directory-level commit counts and recency per touched area.
 * Pure — no git shell-out; uses the injected history source.
 */
export function analyzeFamiliarity(
  input: FamiliarityInput,
  asOf: Date = new Date()
): FamiliarityFinding[] {
  const since = historyWindowSince(asOf);
  const areas = [
    ...new Set(input.touchedPaths.map((touchedPath) => touchedAreaForPath(touchedPath))),
  ];

  return areas.map((area) => {
    const stats = input.historySource.query({
      authorEmail: input.author.email,
      path: area,
      since,
    });

    return {
      area,
      authorCommitCount: stats.authorCommitCount,
      totalAreaCommitCount: stats.totalCommitCount,
      lastTouchDate: stats.lastTouchDate,
      shareOfAreaChurn: 0,
      characterization: "none" as const,
    };
  });
}
