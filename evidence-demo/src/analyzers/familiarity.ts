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

export type FamiliarityCharacterization = FamiliarityFinding["characterization"];

/** Author's share of total commits in an area (0 when area has no churn). */
export function shareOfAreaChurn(
  authorCommitCount: number,
  totalAreaCommitCount: number
): number {
  if (totalAreaCommitCount === 0) {
    return 0;
  }
  return authorCommitCount / totalAreaCommitCount;
}

function daysSince(date: Date, asOf: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((asOf.getTime() - date.getTime()) / msPerDay);
}

/**
 * Slice 3: characterize familiarity from counts, share, and recency.
 * Stale history cannot yield high regardless of commit count.
 */
export function characterizeFamiliarity(
  authorCommitCount: number,
  totalAreaCommitCount: number,
  lastTouchDate: Date | null,
  asOf: Date = new Date()
): Pick<FamiliarityFinding, "shareOfAreaChurn" | "characterization"> {
  const share = shareOfAreaChurn(authorCommitCount, totalAreaCommitCount);

  if (authorCommitCount === 0 || lastTouchDate === null) {
    return { shareOfAreaChurn: share, characterization: "none" };
  }

  const recencyDays = daysSince(lastTouchDate, asOf);

  if (recencyDays > 180) {
    return { shareOfAreaChurn: share, characterization: "none" };
  }

  if (recencyDays > 120 && authorCommitCount === 1) {
    return { shareOfAreaChurn: share, characterization: "none" };
  }

  const qualifiesForHigh =
    recencyDays <= 60 &&
    (authorCommitCount >= 3 || share >= 0.25);

  if (qualifiesForHigh) {
    return { shareOfAreaChurn: share, characterization: "high" };
  }

  const qualifiesForModerate =
    (recencyDays <= 120 && authorCommitCount >= 1) ||
    (recencyDays > 120 && recencyDays <= 180 && authorCommitCount >= 2);

  if (qualifiesForModerate) {
    return { shareOfAreaChurn: share, characterization: "moderate" };
  }

  return { shareOfAreaChurn: share, characterization: "none" };
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

    const { shareOfAreaChurn, characterization } = characterizeFamiliarity(
      stats.authorCommitCount,
      stats.totalCommitCount,
      stats.lastTouchDate,
      asOf
    );

    return {
      area,
      authorCommitCount: stats.authorCommitCount,
      totalAreaCommitCount: stats.totalCommitCount,
      lastTouchDate: stats.lastTouchDate,
      shareOfAreaChurn,
      characterization,
    };
  });
}
