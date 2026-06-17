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

export function analyzeFamiliarity(
  _input: FamiliarityInput
): FamiliarityFinding[] {
  throw new Error("analyzeFamiliarity: not yet implemented");
}
