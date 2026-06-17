/**
 * Impure edge: resolves a PR or commit range to changed files and author.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

export interface AuthorIdentity {
  name: string;
  email: string;
}

export interface ChangedFilesResult {
  changedFiles: string[];
  author: AuthorIdentity;
}

export interface ChangedFilesInput {
  repoPath: string;
  prOrRange: string;
}

type ParsedReference =
  | { kind: "range"; base: string; head: string }
  | { kind: "pr"; number: number }
  | { kind: "branch"; branch: string };

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

function resolveRef(repoPath: string, ref: string): string {
  return runGit(repoPath, ["rev-parse", "--verify", ref]);
}

function getDefaultBranchRef(repoPath: string): string {
  try {
    const symref = runGit(repoPath, [
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
    ]);
    return symref.replace(/^refs\/remotes\//, "");
  } catch {
    for (const candidate of [
      "origin/main",
      "origin/master",
      "main",
      "master",
    ]) {
      try {
        resolveRef(repoPath, candidate);
        return candidate;
      } catch {
        // try next candidate
      }
    }
    throw new Error(
      "Could not determine default branch; use an explicit base...head range"
    );
  }
}

function parsePrOrRange(prOrRange: string): ParsedReference {
  const trimmed = prOrRange.trim();
  if (trimmed.length === 0) {
    throw new Error("prOrRange must not be empty");
  }

  if (trimmed.includes("...")) {
    const [base, head] = trimmed.split("...");
    if (!base || !head) {
      throw new Error(
        `Invalid commit range "${trimmed}"; expected base...head`
      );
    }
    return { kind: "range", base, head };
  }

  if (/^\d+$/.test(trimmed)) {
    return { kind: "pr", number: Number.parseInt(trimmed, 10) };
  }

  return { kind: "branch", branch: trimmed };
}

function resolvePullRequestHead(repoPath: string, prNumber: number): string {
  const candidates = [
    `refs/remotes/origin/pull/${prNumber}/head`,
    `refs/pull/${prNumber}/head`,
    `origin/pull/${prNumber}/head`,
  ];

  for (const ref of candidates) {
    try {
      return resolveRef(repoPath, ref);
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    `PR #${prNumber} not found locally; fetch pull refs (e.g. git fetch origin pull/${prNumber}/head) before running`
  );
}

function resolveRange(
  repoPath: string,
  parsed: ParsedReference
): { base: string; head: string } {
  switch (parsed.kind) {
    case "range":
      return {
        base: resolveRef(repoPath, parsed.base),
        head: resolveRef(repoPath, parsed.head),
      };
    case "branch": {
      const head = resolveRef(repoPath, parsed.branch);
      const defaultBranch = getDefaultBranchRef(repoPath);
      const base = runGit(repoPath, ["merge-base", defaultBranch, head]);
      return { base, head };
    }
    case "pr": {
      const head = resolvePullRequestHead(repoPath, parsed.number);
      const defaultBranch = getDefaultBranchRef(repoPath);
      const base = runGit(repoPath, ["merge-base", defaultBranch, head]);
      return { base, head };
    }
  }
}

function listChangedFiles(
  repoPath: string,
  base: string,
  head: string
): string[] {
  const output = runGit(repoPath, ["diff", "--name-only", `${base}...${head}`]);
  if (output.length === 0) {
    return [];
  }
  return output.split("\n").filter((filePath) => filePath.length > 0);
}

function resolveAuthor(repoPath: string, head: string): AuthorIdentity {
  const output = runGit(repoPath, ["log", "-1", "--format=%an%x00%ae", head]);
  const separator = output.indexOf("\0");
  if (separator === -1) {
    throw new Error(`Could not parse author from git log for ${head}`);
  }

  return {
    name: output.slice(0, separator),
    email: output.slice(separator + 1),
  };
}

export function resolveChangedFiles(input: ChangedFilesInput): ChangedFilesResult {
  const repoPath = path.resolve(input.repoPath);
  runGit(repoPath, ["rev-parse", "--git-dir"]);

  const parsed = parsePrOrRange(input.prOrRange);
  const { base, head } = resolveRange(repoPath, parsed);

  return {
    changedFiles: listChangedFiles(repoPath, base, head),
    author: resolveAuthor(repoPath, head),
  };
}
