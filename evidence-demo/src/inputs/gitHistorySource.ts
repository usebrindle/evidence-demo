/**
 * Impure edge: reads git log from a local clone.
 * History window is hardcoded to 6 months in v1.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

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
  query(query: GitHistoryQuery): GitHistoryStats;
}

export function historyWindowSince(from: Date = new Date()): Date {
  const since = new Date(from);
  since.setMonth(since.getMonth() - HISTORY_WINDOW_MONTHS);
  return since;
}

function runGit(repoPath: string, args: readonly string[]): string {
  try {
    return execFileSync("git", args as string[], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error
        ? String((error as NodeJS.ErrnoException & { stderr?: Buffer }).stderr ?? "")
        : "";
    throw new Error(
      `git ${args.join(" ")} failed in ${repoPath}${message ? `: ${message.trim()}` : ""}`
    );
  }
}

function countLogCommits(repoPath: string, args: readonly string[]): number {
  const output = runGit(repoPath, args);
  if (output.length === 0) {
    return 0;
  }
  return output.split("\n").filter((line) => line.length > 0).length;
}

export function createGitHistorySource(repoPath: string): GitHistorySource {
  const resolvedPath = path.resolve(repoPath);
  runGit(resolvedPath, ["rev-parse", "--git-dir"]);

  return {
    query(query: GitHistoryQuery): GitHistoryStats {
      const since = query.since.toISOString();
      const pathFilter = query.path;

      const totalCommitCount = countLogCommits(resolvedPath, [
        "log",
        `--since=${since}`,
        "--format=%H",
        "--",
        pathFilter,
      ]);

      const authorCommitCount = countLogCommits(resolvedPath, [
        "log",
        `--since=${since}`,
        `--author=${query.authorEmail}`,
        "--format=%H",
        "--",
        pathFilter,
      ]);

      let lastTouchDate: Date | null = null;
      if (authorCommitCount > 0) {
        const lastTouch = runGit(resolvedPath, [
          "log",
          `--since=${since}`,
          `--author=${query.authorEmail}`,
          "--format=%aI",
          "-1",
          "--",
          pathFilter,
        ]);
        if (lastTouch.length > 0) {
          lastTouchDate = new Date(lastTouch);
        }
      }

      return {
        authorCommitCount,
        totalCommitCount,
        lastTouchDate,
      };
    },
  };
}
