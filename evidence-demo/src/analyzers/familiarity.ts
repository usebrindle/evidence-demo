/**
 * Pure familiarity analyzer (core-destined).
 * Inputs: author identity, touched paths, and a history source.
 */

import type { GitHistorySource } from "../inputs/gitHistorySource.js";
import type { AuthorIdentity } from "../inputs/changedFiles.js";

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

export function analyzeFamiliarity(
  _input: FamiliarityInput
): FamiliarityFinding[] {
  throw new Error("analyzeFamiliarity: not yet implemented");
}
