/**
 * Impure edge: reads git blame from a local clone.
 * Slice 4: current content ownership at an analysis revision.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

export interface GitBlameQuery {
  path: string;
  authorEmail: string;
  revision: string;
}

export interface GitBlameStats {
  authorOwnedLineCount: number;
  totalBlameableLineCount: number;
}

export interface GitBlameSource {
  query(query: GitBlameQuery): GitBlameStats;
}

const EMPTY_STATS: GitBlameStats = {
  authorOwnedLineCount: 0,
  totalBlameableLineCount: 0,
};

function runGit(repoPath: string, args: readonly string[]): string {
  try {
    return execFileSync("git", args as string[], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
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

function normalizeEmail(email: string): string {
  return email.replace(/^<|>$/g, "").trim();
}

function isBlameableLine(content: string): boolean {
  return content.trim().length > 0;
}

function parseBlamePorcelain(
  output: string,
  authorEmail: string
): GitBlameStats {
  const normalizedAuthor = normalizeEmail(authorEmail);
  let currentAuthorEmail = "";
  let authorOwnedLineCount = 0;
  let totalBlameableLineCount = 0;

  for (const line of output.split("\n")) {
    if (line.startsWith("author-mail ")) {
      currentAuthorEmail = normalizeEmail(line.slice("author-mail ".length));
      continue;
    }

    if (line.startsWith("\t")) {
      const content = line.slice(1);
      if (!isBlameableLine(content)) {
        continue;
      }

      totalBlameableLineCount += 1;
      if (currentAuthorEmail === normalizedAuthor) {
        authorOwnedLineCount += 1;
      }
    }
  }

  return { authorOwnedLineCount, totalBlameableLineCount };
}

function blameAtRevision(
  repoPath: string,
  revision: string,
  filePath: string
): string | null {
  try {
    return runGit(repoPath, [
      "blame",
      "--line-porcelain",
      revision,
      "--",
      filePath,
    ]);
  } catch {
    return null;
  }
}

export function createGitBlameSource(repoPath: string): GitBlameSource {
  const resolvedPath = path.resolve(repoPath);
  runGit(resolvedPath, ["rev-parse", "--git-dir"]);

  return {
    query(query: GitBlameQuery): GitBlameStats {
      const output = blameAtRevision(
        resolvedPath,
        query.revision,
        query.path
      );
      if (output === null || output.length === 0) {
        return { ...EMPTY_STATS };
      }

      return parseBlamePorcelain(output, query.authorEmail);
    },
  };
}
