/**
 * Pure familiarity analyzer (core-destined).
 * Inputs: author identity, touched paths, and a history source.
 */

import type { AuthorIdentity } from "../inputs/changedFiles.js";
import type { GitHistorySource } from "../inputs/gitHistorySource.js";
import { historyWindowSince } from "../inputs/gitHistorySource.js";

export interface FamiliarityFinding {
  touchedFile: string;
  authorCommitCount: number;
  totalFileCommitCount: number;
  lastTouchDate: Date | null;
  shareOfFileChurn: number;
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

/** Author's share of total commits to a file (0 when the file has no churn). */
export function shareOfFileChurn(
  authorCommitCount: number,
  totalFileCommitCount: number
): number {
  if (totalFileCommitCount === 0) {
    return 0;
  }
  return authorCommitCount / totalFileCommitCount;
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
  totalFileCommitCount: number,
  lastTouchDate: Date | null,
  asOf: Date = new Date()
): Pick<FamiliarityFinding, "shareOfFileChurn" | "characterization"> {
  const share = shareOfFileChurn(authorCommitCount, totalFileCommitCount);

  if (authorCommitCount === 0 || lastTouchDate === null) {
    return { shareOfFileChurn: share, characterization: "none" };
  }

  const recencyDays = daysSince(lastTouchDate, asOf);

  if (recencyDays > 180) {
    return { shareOfFileChurn: share, characterization: "none" };
  }

  if (recencyDays > 120 && authorCommitCount === 1) {
    return { shareOfFileChurn: share, characterization: "none" };
  }

  const qualifiesForHigh =
    recencyDays <= 60 &&
    (authorCommitCount >= 3 || share >= 0.25);

  if (qualifiesForHigh) {
    return { shareOfFileChurn: share, characterization: "high" };
  }

  const qualifiesForModerate =
    (recencyDays <= 120 && authorCommitCount >= 1) ||
    (recencyDays > 120 && recencyDays <= 180 && authorCommitCount >= 2);

  if (qualifiesForModerate) {
    return { shareOfFileChurn: share, characterization: "moderate" };
  }

  return { shareOfFileChurn: share, characterization: "none" };
}

/**
 * Slice 2: file-level commit counts and recency per changed file.
 * Pure — no git shell-out; uses the injected history source.
 */
export function analyzeFamiliarity(
  input: FamiliarityInput,
  asOf: Date = new Date()
): FamiliarityFinding[] {
  const since = historyWindowSince(asOf);
  const touchedFiles = [...new Set(input.touchedPaths)];

  return touchedFiles.map((touchedFile) => {
    const stats = input.historySource.query({
      authorEmail: input.author.email,
      path: touchedFile,
      since,
    });

    const { shareOfFileChurn, characterization } = characterizeFamiliarity(
      stats.authorCommitCount,
      stats.totalCommitCount,
      stats.lastTouchDate,
      asOf
    );

    return {
      touchedFile,
      authorCommitCount: stats.authorCommitCount,
      totalFileCommitCount: stats.totalCommitCount,
      lastTouchDate: stats.lastTouchDate,
      shareOfFileChurn,
      characterization,
    };
  });
}
