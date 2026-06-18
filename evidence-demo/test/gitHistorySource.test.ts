import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import {
  createGitHistorySource,
  historyWindowSince,
} from "../src/inputs/gitHistorySource.js";

const REFERENCE_DATE = new Date("2026-06-17T12:00:00Z");

function daysAgo(days: number): Date {
  const date = new Date(REFERENCE_DATE);
  date.setDate(date.getDate() - days);
  return date;
}

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
  git(
    repoPath,
    ["commit", "-m", message],
    {
      GIT_AUTHOR_NAME: author.name,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_AUTHOR_DATE: date.toISOString(),
      GIT_COMMITTER_NAME: author.name,
      GIT_COMMITTER_EMAIL: author.email,
      GIT_COMMITTER_DATE: date.toISOString(),
    }
  );
}

describe("createGitHistorySource", () => {
  let repoPath = "";
  let aliceLastTouch: Date;

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-git-history-")
    );
    git(repoPath, ["init"]);
    git(repoPath, ["config", "user.name", "Setup"]);
    git(repoPath, ["config", "user.email", "setup@example.com"]);

    writeRepoFile(repoPath, "src/foo.ts", "export const foo = 1;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(200),
      "alice initial foo outside window"
    );

    writeRepoFile(repoPath, "src/foo.ts", "export const foo = 2;\n");
    commitAs(
      repoPath,
      { name: "Bob Builder", email: "bob@example.com" },
      daysAgo(150),
      "bob first foo"
    );

    writeRepoFile(repoPath, "src/foo.ts", "export const foo = 3;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(90),
      "alice first in-window foo"
    );

    writeRepoFile(repoPath, "src/foo.ts", "export const foo = 4;\n");
    commitAs(
      repoPath,
      { name: "Bob Builder", email: "bob@example.com" },
      daysAgo(60),
      "bob second foo"
    );

    aliceLastTouch = daysAgo(10);
    writeRepoFile(repoPath, "src/foo.ts", "export const foo = 5;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      aliceLastTouch,
      "alice recent foo"
    );

    writeRepoFile(repoPath, "src/bar.ts", "export const bar = 1;\n");
    commitAs(
      repoPath,
      { name: "Bob Builder", email: "bob@example.com" },
      daysAgo(20),
      "bob bar only"
    );
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("counts author commits to a path within the history window", () => {
    const source = createGitHistorySource(repoPath);
    const stats = source.query({
      authorEmail: "alice@example.com",
      path: "src/foo.ts",
      since: historyWindowSince(REFERENCE_DATE),
      revision: "HEAD",
    });

    assert.equal(stats.authorCommitCount, 2);
  });

  it("counts total area churn within the history window", () => {
    const source = createGitHistorySource(repoPath);
    const stats = source.query({
      authorEmail: "alice@example.com",
      path: "src/foo.ts",
      since: historyWindowSince(REFERENCE_DATE),
      revision: "HEAD",
    });

    assert.equal(stats.totalCommitCount, 4);
  });

  it("returns the most recent author touch date", () => {
    const source = createGitHistorySource(repoPath);
    const stats = source.query({
      authorEmail: "alice@example.com",
      path: "src/foo.ts",
      since: historyWindowSince(REFERENCE_DATE),
      revision: "HEAD",
    });

    assert.ok(stats.lastTouchDate);
    assert.equal(
      stats.lastTouchDate!.toISOString(),
      aliceLastTouch.toISOString()
    );
  });

  it("returns zero counts and null last touch when author has no commits in window", () => {
    const source = createGitHistorySource(repoPath);
    const stats = source.query({
      authorEmail: "charlie@example.com",
      path: "src/foo.ts",
      since: historyWindowSince(REFERENCE_DATE),
      revision: "HEAD",
    });

    assert.equal(stats.authorCommitCount, 0);
    assert.equal(stats.totalCommitCount, 4);
    assert.equal(stats.lastTouchDate, null);
  });

  it("aggregates commits under a directory path", () => {
    const source = createGitHistorySource(repoPath);
    const stats = source.query({
      authorEmail: "bob@example.com",
      path: "src/",
      since: historyWindowSince(REFERENCE_DATE),
      revision: "HEAD",
    });

    assert.equal(stats.authorCommitCount, 3);
    assert.equal(stats.totalCommitCount, 5);
  });

  it("excludes commits outside the history window", () => {
    const source = createGitHistorySource(repoPath);
    const stats = source.query({
      authorEmail: "alice@example.com",
      path: "src/foo.ts",
      since: historyWindowSince(REFERENCE_DATE),
      revision: "HEAD",
    });

    assert.notEqual(stats.authorCommitCount, 3);
    assert.notEqual(stats.totalCommitCount, 5);
  });
});

describe("createGitHistorySource revision stop point", () => {
  let repoPath = "";
  let mergeBase = "";
  let mergeBaseTouch: Date;

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-git-history-revision-")
    );
    git(repoPath, ["init"]);
    git(repoPath, ["config", "user.name", "Setup"]);
    git(repoPath, ["config", "user.email", "setup@example.com"]);

    writeRepoFile(repoPath, "src/foo.ts", "export const foo = 1;\n");
    commitAs(
      repoPath,
      { name: "Bob Builder", email: "bob@example.com" },
      daysAgo(150),
      "bob initial foo"
    );

    writeRepoFile(repoPath, "src/foo.ts", "export const foo = 2;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(90),
      "alice pre-merge-base foo"
    );

    mergeBaseTouch = daysAgo(60);
    writeRepoFile(repoPath, "src/foo.ts", "export const foo = 3;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      mergeBaseTouch,
      "alice at merge-base foo"
    );
    mergeBase = git(repoPath, ["rev-parse", "HEAD"]);

    git(repoPath, ["branch", "-M", "main"]);
    git(repoPath, ["checkout", "-b", "feature/pr"]);

    writeRepoFile(repoPath, "src/foo.ts", "export const foo = 4;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(5),
      "alice pr-only foo"
    );
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("does not count author commits on the PR branch after merge-base", () => {
    const source = createGitHistorySource(repoPath);
    const statsAtMergeBase = source.query({
      authorEmail: "alice@example.com",
      path: "src/foo.ts",
      since: historyWindowSince(REFERENCE_DATE),
      revision: mergeBase,
    });
    const statsAtHead = source.query({
      authorEmail: "alice@example.com",
      path: "src/foo.ts",
      since: historyWindowSince(REFERENCE_DATE),
      revision: "HEAD",
    });

    assert.equal(statsAtMergeBase.authorCommitCount, 2);
    assert.equal(statsAtHead.authorCommitCount, 3);
  });

  it("counts author commits at merge-base and before", () => {
    const source = createGitHistorySource(repoPath);
    const stats = source.query({
      authorEmail: "alice@example.com",
      path: "src/foo.ts",
      since: historyWindowSince(REFERENCE_DATE),
      revision: mergeBase,
    });

    assert.equal(stats.authorCommitCount, 2);
    assert.ok(stats.lastTouchDate);
    assert.equal(stats.lastTouchDate!.toISOString(), mergeBaseTouch.toISOString());
  });
});

describe("historyWindowSince", () => {
  it("returns a date HISTORY_WINDOW_MONTHS before the reference", () => {
    const since = historyWindowSince(REFERENCE_DATE);
    const expected = new Date(REFERENCE_DATE);
    expected.setMonth(expected.getMonth() - 6);

    assert.equal(since.toISOString(), expected.toISOString());
  });
});
