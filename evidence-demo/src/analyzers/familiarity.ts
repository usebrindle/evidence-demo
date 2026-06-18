/**
 * Pure familiarity analyzer (core-destined).
 * Inputs: author identity, touched paths, and a history source.
 */

import type { AuthorIdentity, ChangedFileEntry } from "../inputs/changedFiles.js";
import type { GitBlameSource } from "../inputs/gitBlameSource.js";
import type { GitHistorySource } from "../inputs/gitHistorySource.js";
import { historyWindowSince } from "../inputs/gitHistorySource.js";

export interface FamiliarityFinding {
  touchedFile: string;
  authorOwnedLineCount: number;
  totalBlameableLineCount: number;
  shareOfCurrentContent: number;
  authorChangedLineCount: number;
  totalChangedLineCount: number;
  shareOfWindowedLineChurn: number;
  authorCommitCount: number;
  totalFileCommitCount: number;
  lastTouchDate: Date | null;
  shareOfFileCommitChurn: number;
  characterization: "high" | "moderate" | "none";
}

export interface FamiliarityInput {
  author: AuthorIdentity;
  changedFiles: readonly ChangedFileEntry[];
  historySource: GitHistorySource;
  blameSource: GitBlameSource;
  /** Merge-base (or explicit range base) — measurement stop point for blame and history. */
  baseRevision: string;
}

/**
 * Slice 1: count an author's commits to a single touched file over the
 * 6-month history window. Pure — no git shell-out; uses the injected source.
 */
export function countAuthorCommitsToFile(
  author: AuthorIdentity,
  touchedPath: string,
  historySource: GitHistorySource,
  revision: string,
  asOf: Date = new Date()
): number {
  const stats = historySource.query({
    authorEmail: author.email,
    path: touchedPath,
    since: historyWindowSince(asOf),
    revision,
  });
  return stats.authorCommitCount;
}

export type FamiliarityCharacterization = FamiliarityFinding["characterization"];

/** Author's share of blameable lines at the analysis revision (0 when none). */
export function shareOfCurrentContent(
  authorOwnedLineCount: number,
  totalBlameableLineCount: number
): number {
  if (totalBlameableLineCount === 0) {
    return 0;
  }
  return authorOwnedLineCount / totalBlameableLineCount;
}

/** Author's share of line changes within the history window (0 when none). */
export function shareOfWindowedLineChurn(
  authorChangedLineCount: number,
  totalChangedLineCount: number
): number {
  if (totalChangedLineCount === 0) {
    return 0;
  }
  return authorChangedLineCount / totalChangedLineCount;
}

/** Author's share of total commits to a file (0 when the file has no churn). */
export function shareOfFileCommitChurn(
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
 * Slice 3 + LLD 0001 combined rule: line shares and commit activity, recency-gated.
 * Stale history cannot yield high regardless of line ownership or commit count.
 */
export function characterizeFamiliarity(
  authorCommitCount: number,
  totalFileCommitCount: number,
  lastTouchDate: Date | null,
  shareOfCurrentContent: number = 0,
  shareOfWindowedLineChurn: number = 0,
  asOf: Date = new Date()
): Pick<FamiliarityFinding, "shareOfFileCommitChurn" | "characterization"> {
  const share = shareOfFileCommitChurn(authorCommitCount, totalFileCommitCount);

  if (authorCommitCount === 0 || lastTouchDate === null) {
    return { shareOfFileCommitChurn: share, characterization: "none" };
  }

  const recencyDays = daysSince(lastTouchDate, asOf);

  if (recencyDays > 180) {
    return { shareOfFileCommitChurn: share, characterization: "none" };
  }

  if (recencyDays > 120 && authorCommitCount === 1) {
    return { shareOfFileCommitChurn: share, characterization: "none" };
  }

  const qualifiesForHigh =
    recencyDays <= 60 &&
    (shareOfCurrentContent >= 0.25 ||
      shareOfWindowedLineChurn >= 0.25 ||
      authorCommitCount >= 3);

  if (qualifiesForHigh) {
    return { shareOfFileCommitChurn: share, characterization: "high" };
  }

  const qualifiesForModerate =
    (recencyDays <= 120 && authorCommitCount >= 2) ||
    (recencyDays > 120 &&
      recencyDays <= 180 &&
      authorCommitCount >= 2) ||
    (recencyDays <= 120 &&
      (shareOfCurrentContent >= 0.1 || shareOfWindowedLineChurn >= 0.1));

  if (qualifiesForModerate) {
    return { shareOfFileCommitChurn: share, characterization: "moderate" };
  }

  return { shareOfFileCommitChurn: share, characterization: "none" };
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
  const seenPaths = new Set<string>();
  const uniqueEntries = input.changedFiles.filter((entry) => {
    if (seenPaths.has(entry.path)) {
      return false;
    }
    seenPaths.add(entry.path);
    return true;
  });

  return uniqueEntries.map(({ path: touchedFile }) => {
    const stats = input.historySource.query({
      authorEmail: input.author.email,
      path: touchedFile,
      since,
      revision: input.baseRevision,
    });

    const blameStats = input.blameSource.query({
      path: touchedFile,
      authorEmail: input.author.email,
      revision: input.baseRevision,
      since,
    });

    const {
      authorOwnedLineCount,
      totalBlameableLineCount,
      authorChangedLineCount,
      totalChangedLineCount,
    } = blameStats;

    const currentContentShare = shareOfCurrentContent(
      authorOwnedLineCount,
      totalBlameableLineCount
    );
    const windowedLineChurnShare = shareOfWindowedLineChurn(
      authorChangedLineCount,
      totalChangedLineCount
    );

    const { shareOfFileCommitChurn, characterization } = characterizeFamiliarity(
      stats.authorCommitCount,
      stats.totalCommitCount,
      stats.lastTouchDate,
      currentContentShare,
      windowedLineChurnShare,
      asOf
    );

    return {
      touchedFile,
      authorOwnedLineCount,
      totalBlameableLineCount,
      shareOfCurrentContent: currentContentShare,
      authorChangedLineCount,
      totalChangedLineCount,
      shareOfWindowedLineChurn: windowedLineChurnShare,
      authorCommitCount: stats.authorCommitCount,
      totalFileCommitCount: stats.totalCommitCount,
      lastTouchDate: stats.lastTouchDate,
      shareOfFileCommitChurn,
      characterization,
    };
  });
}
