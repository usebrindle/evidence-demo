/**
 * Impure edge: reads git log from a local clone.
 * History window is hardcoded to 6 months in v1.
 */

export const HISTORY_WINDOW_MONTHS = 6;

export interface GitHistoryQuery {
  authorEmail: string;
  path: string;
  since: Date;
}

export interface GitHistoryStats {
  authorCommitCount: number;
  totalCommitCount: number;
  lastTouchDate: Date | null;
}

export interface GitHistorySource {
  query(stats: GitHistoryQuery): GitHistoryStats;
}

export function createGitHistorySource(
  _repoPath: string
): GitHistorySource {
  throw new Error("createGitHistorySource: not yet implemented");
}
