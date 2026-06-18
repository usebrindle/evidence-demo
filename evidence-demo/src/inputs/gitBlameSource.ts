/**
 * Impure edge: reads git blame from a local clone.
 * Slice 4: current content ownership at an analysis revision.
 * Slice 5: windowed line churn via blame --since within the history window.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

export interface GitBlameQuery {
  path: string;
  authorEmail: string;
  revision: string;
  since: Date;
}

export interface GitBlameStats {
  authorOwnedLineCount: number;
  totalBlameableLineCount: number;
  authorChangedLineCount: number;
  totalChangedLineCount: number;
}

export interface GitBlameSource {
  query(query: GitBlameQuery): GitBlameStats;
}

const EMPTY_STATS: GitBlameStats = {
  authorOwnedLineCount: 0,
  totalBlameableLineCount: 0,
  authorChangedLineCount: 0,
  totalChangedLineCount: 0,
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

function parseCurrentContentOwnership(
  output: string,
  authorEmail: string
): Pick<GitBlameStats, "authorOwnedLineCount" | "totalBlameableLineCount"> {
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

function parseWindowedLineChurn(
  output: string,
  authorEmail: string,
  since: Date
): Pick<GitBlameStats, "authorChangedLineCount" | "totalChangedLineCount"> {
  const normalizedAuthor = normalizeEmail(authorEmail);
  const sinceSeconds = Math.floor(since.getTime() / 1000);
  let currentAuthorEmail = "";
  let currentAuthorTime = 0;
  let authorChangedLineCount = 0;
  let totalChangedLineCount = 0;

  for (const line of output.split("\n")) {
    if (line.startsWith("author-mail ")) {
      currentAuthorEmail = normalizeEmail(line.slice("author-mail ".length));
      continue;
    }

    if (line.startsWith("author-time ")) {
      currentAuthorTime = Number.parseInt(
        line.slice("author-time ".length),
        10
      );
      continue;
    }

    if (line.startsWith("\t")) {
      const content = line.slice(1);
      if (!isBlameableLine(content)) {
        continue;
      }

      if (currentAuthorTime < sinceSeconds) {
        continue;
      }

      totalChangedLineCount += 1;
      if (currentAuthorEmail === normalizedAuthor) {
        authorChangedLineCount += 1;
      }
    }
  }

  return { authorChangedLineCount, totalChangedLineCount };
}

function blameAtRevision(
  repoPath: string,
  revision: string,
  filePath: string,
  since?: Date
): string | null {
  const args = ["blame", "--line-porcelain"];
  if (since !== undefined) {
    args.push(`--since=${since.toISOString()}`);
  }
  args.push(revision, "--", filePath);

  try {
    return runGit(repoPath, args);
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

      const ownership = parseCurrentContentOwnership(
        output,
        query.authorEmail
      );

      const windowedOutput = blameAtRevision(
        resolvedPath,
        query.revision,
        query.path,
        query.since
      );
      const churn =
        windowedOutput === null || windowedOutput.length === 0
          ? {
              authorChangedLineCount: 0,
              totalChangedLineCount: 0,
            }
          : parseWindowedLineChurn(
              windowedOutput,
              query.authorEmail,
              query.since
            );

      return { ...ownership, ...churn };
    },
  };
}
