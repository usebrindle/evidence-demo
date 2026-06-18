import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { createGitBlameSource } from "../src/inputs/gitBlameSource.js";
import { historyWindowSince } from "../src/inputs/gitHistorySource.js";

function git(
  repoPath: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv
): string {
  return execFileSync("git", args as string[], {
    cwd: repoPath,
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
  }).trim();
}

function writeRepoFile(
  repoPath: string,
  relativePath: string,
  contents: string
): void {
  const fullPath = path.join(repoPath, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function commitAs(
  repoPath: string,
  author: { name: string; email: string },
  date: Date,
  message: string
): void {
  git(repoPath, ["add", "-A"]);
  git(repoPath, ["commit", "-m", message], {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_AUTHOR_DATE: date.toISOString(),
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
    GIT_COMMITTER_DATE: date.toISOString(),
  });
}

describe("createGitBlameSource", () => {
  let repoPath = "";
  let headRevision = "";
  const referenceDate = new Date("2026-06-17T12:00:00Z");
  const windowSince = historyWindowSince(referenceDate);

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-git-blame-")
    );
    git(repoPath, ["init"]);
    git(repoPath, ["config", "user.name", "Setup"]);
    git(repoPath, ["config", "user.email", "setup@example.com"]);

    writeRepoFile(
      repoPath,
      "src/mixed.ts",
      [
        "// alice line one",
        "",
        "export const alice = 1;",
        "// bob line",
        "export const bob = 2;",
      ].join("\n")
    );
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      new Date("2026-01-01T12:00:00Z"),
      "alice initial mixed"
    );

    writeRepoFile(
      repoPath,
      "src/mixed.ts",
      [
        "// alice line one",
        "",
        "export const alice = 1;",
        "// bob line",
        "export const bob = 2;",
        "export const bobExtra = 3;",
      ].join("\n")
    );
    commitAs(
      repoPath,
      { name: "Bob Builder", email: "bob@example.com" },
      new Date("2026-02-01T12:00:00Z"),
      "bob extends mixed"
    );

    writeRepoFile(repoPath, "src/empty.ts", "");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      new Date("2026-03-01T12:00:00Z"),
      "add empty file"
    );

    writeRepoFile(repoPath, "src/blank.ts", "\n\n  \n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      new Date("2026-04-01T12:00:00Z"),
      "add blank-only file"
    );

    headRevision = git(repoPath, ["rev-parse", "HEAD"]);
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("counts author-owned blameable lines at head revision", () => {
    const source = createGitBlameSource(repoPath);
    const stats = source.query({
      path: "src/mixed.ts",
      authorEmail: "alice@example.com",
      revision: headRevision,
      since: windowSince,
    });

    assert.equal(stats.totalBlameableLineCount, 5);
    assert.equal(stats.authorOwnedLineCount, 3);
  });

  it("attributes all blameable lines to the sole author", () => {
    const source = createGitBlameSource(repoPath);
    const stats = source.query({
      path: "src/mixed.ts",
      authorEmail: "bob@example.com",
      revision: headRevision,
      since: windowSince,
    });

    assert.equal(stats.totalBlameableLineCount, 5);
    assert.equal(stats.authorOwnedLineCount, 2);
  });

  it("returns zero counts for an empty file", () => {
    const source = createGitBlameSource(repoPath);
    const stats = source.query({
      path: "src/empty.ts",
      authorEmail: "alice@example.com",
      revision: headRevision,
      since: windowSince,
    });

    assert.equal(stats.totalBlameableLineCount, 0);
    assert.equal(stats.authorOwnedLineCount, 0);
  });

  it("returns zero counts for an all-blank file", () => {
    const source = createGitBlameSource(repoPath);
    const stats = source.query({
      path: "src/blank.ts",
      authorEmail: "alice@example.com",
      revision: headRevision,
      since: windowSince,
    });

    assert.equal(stats.totalBlameableLineCount, 0);
    assert.equal(stats.authorOwnedLineCount, 0);
  });

  it("returns zero counts when the file does not exist at the revision", () => {
    const source = createGitBlameSource(repoPath);
    const stats = source.query({
      path: "src/missing.ts",
      authorEmail: "alice@example.com",
      revision: headRevision,
      since: windowSince,
    });

    assert.equal(stats.totalBlameableLineCount, 0);
    assert.equal(stats.authorOwnedLineCount, 0);
  });

  it("counts windowed line churn for edits inside the history window", () => {
    const source = createGitBlameSource(repoPath);
    const stats = source.query({
      path: "src/mixed.ts",
      authorEmail: "alice@example.com",
      revision: headRevision,
      since: windowSince,
    });

    assert.equal(stats.totalChangedLineCount, 5);
    assert.equal(stats.authorChangedLineCount, 3);
  });

  it("excludes line changes outside the history window from windowed churn", () => {
    const source = createGitBlameSource(repoPath);
    const stats = source.query({
      path: "src/mixed.ts",
      authorEmail: "alice@example.com",
      revision: headRevision,
      since: new Date("2026-03-15T12:00:00Z"),
    });

    assert.equal(stats.totalChangedLineCount, 0);
    assert.equal(stats.authorChangedLineCount, 0);
  });

  it("attributes windowed churn to the author who edited within the window", () => {
    const source = createGitBlameSource(repoPath);
    const stats = source.query({
      path: "src/mixed.ts",
      authorEmail: "bob@example.com",
      revision: headRevision,
      since: windowSince,
    });

    assert.equal(stats.totalChangedLineCount, 5);
    assert.equal(stats.authorChangedLineCount, 2);
  });

  it("returns zero windowed churn counts for empty and blank files", () => {
    const source = createGitBlameSource(repoPath);

    for (const filePath of ["src/empty.ts", "src/blank.ts"]) {
      const stats = source.query({
        path: filePath,
        authorEmail: "alice@example.com",
        revision: headRevision,
        since: windowSince,
      });

      assert.equal(stats.totalChangedLineCount, 0);
      assert.equal(stats.authorChangedLineCount, 0);
    }
  });
});
