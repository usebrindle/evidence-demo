import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import {
  analyzeFamiliarity,
  characterizeFamiliarity,
  countAuthorCommitsToFile,
  shareOfCurrentContent,
  shareOfFileCommitChurn,
  shareOfWindowedLineChurn,
} from "../src/analyzers/familiarity.js";
import { createGitHistorySource } from "../src/inputs/gitHistorySource.js";

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

describe("countAuthorCommitsToFile", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-familiarity-")
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

    writeRepoFile(repoPath, "src/foo.ts", "export const foo = 5;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(10),
      "alice recent foo"
    );

    writeRepoFile(repoPath, "src/bar.ts", "export const bar = 1;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(5),
      "alice bar only"
    );
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("returns raw author commit count for one file within the history window", () => {
    const historySource = createGitHistorySource(repoPath);
    const count = countAuthorCommitsToFile(
      { name: "Alice Author", email: "alice@example.com" },
      "src/foo.ts",
      historySource,
      REFERENCE_DATE
    );

    assert.equal(count, 2);
  });

  it("returns zero when the author has no commits to the file in the window", () => {
    const historySource = createGitHistorySource(repoPath);
    const count = countAuthorCommitsToFile(
      { name: "Charlie Coder", email: "charlie@example.com" },
      "src/foo.ts",
      historySource,
      REFERENCE_DATE
    );

    assert.equal(count, 0);
  });

  it("counts only the requested file, not sibling paths", () => {
    const historySource = createGitHistorySource(repoPath);
    const count = countAuthorCommitsToFile(
      { name: "Alice Author", email: "alice@example.com" },
      "src/bar.ts",
      historySource,
      REFERENCE_DATE
    );

    assert.equal(count, 1);
  });

  it("excludes author commits outside the 6-month history window", () => {
    const historySource = createGitHistorySource(repoPath);
    const count = countAuthorCommitsToFile(
      { name: "Alice Author", email: "alice@example.com" },
      "src/foo.ts",
      historySource,
      REFERENCE_DATE
    );

    assert.notEqual(count, 3);
  });
});

describe("analyzeFamiliarity", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-familiarity-slice2-")
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

    writeRepoFile(repoPath, "src/foo.ts", "export const foo = 5;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(10),
      "alice recent foo"
    );

    writeRepoFile(repoPath, "src/bar.ts", "export const bar = 1;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(5),
      "alice bar only"
    );

    writeRepoFile(repoPath, "lib/util.ts", "export const util = 1;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(20),
      "alice lib util"
    );

    writeRepoFile(repoPath, "lib/util.ts", "export const util = 2;\n");
    commitAs(
      repoPath,
      { name: "Bob Builder", email: "bob@example.com" },
      daysAgo(15),
      "bob lib util"
    );
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("returns author commit counts at the file level", () => {
    const historySource = createGitHistorySource(repoPath);
    const findings = analyzeFamiliarity(
      {
        author: { name: "Alice Author", email: "alice@example.com" },
        touchedPaths: ["src/foo.ts"],
        historySource,
      },
      REFERENCE_DATE
    );

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.touchedFile, "src/foo.ts");
    assert.equal(findings[0]?.authorCommitCount, 2);
    assert.equal(findings[0]?.totalFileCommitCount, 4);
  });

  it("includes the author's most recent commit date to each file", () => {
    const historySource = createGitHistorySource(repoPath);
    const findings = analyzeFamiliarity(
      {
        author: { name: "Alice Author", email: "alice@example.com" },
        touchedPaths: ["src/foo.ts", "src/bar.ts"],
        historySource,
      },
      REFERENCE_DATE
    );

    assert.equal(findings.length, 2);
    const fooFinding = findings.find((finding) => finding.touchedFile === "src/foo.ts");
    const barFinding = findings.find((finding) => finding.touchedFile === "src/bar.ts");
    assert.deepEqual(fooFinding?.lastTouchDate, daysAgo(10));
    assert.deepEqual(barFinding?.lastTouchDate, daysAgo(5));
  });

  it("returns one finding per unique changed file", () => {
    const historySource = createGitHistorySource(repoPath);
    const findings = analyzeFamiliarity(
      {
        author: { name: "Alice Author", email: "alice@example.com" },
        touchedPaths: ["src/foo.ts", "src/bar.ts", "lib/util.ts"],
        historySource,
      },
      REFERENCE_DATE
    );

    assert.equal(findings.length, 3);
    const files = findings.map((finding) => finding.touchedFile).sort();
    assert.deepEqual(files, ["lib/util.ts", "src/bar.ts", "src/foo.ts"]);
  });

  it("returns structured findings with supporting counts per file", () => {
    const historySource = createGitHistorySource(repoPath);
    const findings = analyzeFamiliarity(
      {
        author: { name: "Alice Author", email: "alice@example.com" },
        touchedPaths: ["lib/util.ts"],
        historySource,
      },
      REFERENCE_DATE
    );

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.touchedFile, "lib/util.ts");
    assert.equal(findings[0]?.authorCommitCount, 1);
    assert.equal(findings[0]?.totalFileCommitCount, 2);
    assert.deepEqual(findings[0]?.lastTouchDate, daysAgo(20));
    assert.equal(findings[0]?.authorOwnedLineCount, 0);
    assert.equal(findings[0]?.totalBlameableLineCount, 0);
    assert.equal(findings[0]?.shareOfCurrentContent, 0);
    assert.equal(findings[0]?.authorChangedLineCount, 0);
    assert.equal(findings[0]?.totalChangedLineCount, 0);
    assert.equal(findings[0]?.shareOfWindowedLineChurn, 0);
  });
});

describe("shareOfFileCommitChurn", () => {
  it("returns author commits divided by total file commits", () => {
    assert.equal(shareOfFileCommitChurn(3, 12), 0.25);
  });

  it("returns zero when the file has no churn", () => {
    assert.equal(shareOfFileCommitChurn(0, 0), 0);
  });
});

describe("shareOfCurrentContent", () => {
  it("returns author-owned lines divided by total blameable lines", () => {
    assert.equal(shareOfCurrentContent(25, 100), 0.25);
  });

  it("returns zero when the file has no blameable lines", () => {
    assert.equal(shareOfCurrentContent(0, 0), 0);
  });
});

describe("shareOfWindowedLineChurn", () => {
  it("returns author-changed lines divided by total changed lines", () => {
    assert.equal(shareOfWindowedLineChurn(10, 40), 0.25);
  });

  it("returns zero when no lines changed in the window", () => {
    assert.equal(shareOfWindowedLineChurn(0, 0), 0);
  });
});

describe("characterizeFamiliarity", () => {
  it("returns high when recent with enough commits", () => {
    const result = characterizeFamiliarity(3, 10, daysAgo(30), 0, 0, REFERENCE_DATE);
    assert.equal(result.characterization, "high");
    assert.equal(result.shareOfFileCommitChurn, 0.3);
  });

  it("returns high when recent with high current-content share but fewer than 3 commits", () => {
    const result = characterizeFamiliarity(1, 6, daysAgo(45), 0.3, 0, REFERENCE_DATE);
    assert.equal(result.characterization, "high");
    assert.equal(result.shareOfFileCommitChurn, 1 / 6);
  });

  it("returns high for single-rewrite case: one recent commit with high line ownership", () => {
    const result = characterizeFamiliarity(1, 20, daysAgo(10), 0.62, 0.41, REFERENCE_DATE);
    assert.equal(result.characterization, "high");
    assert.equal(result.shareOfFileCommitChurn, 0.05);
  });

  it("returns high when recent with high windowed line churn share", () => {
    const result = characterizeFamiliarity(2, 10, daysAgo(30), 0, 0.3, REFERENCE_DATE);
    assert.equal(result.characterization, "high");
  });

  it("returns moderate when recent with one commit and low line shares", () => {
    const result = characterizeFamiliarity(1, 20, daysAgo(90), 0, 0, REFERENCE_DATE);
    assert.equal(result.characterization, "moderate");
    assert.equal(result.shareOfFileCommitChurn, 0.05);
  });

  it("returns moderate when recent with moderate line ownership below high threshold", () => {
    const result = characterizeFamiliarity(1, 10, daysAgo(90), 0.15, 0, REFERENCE_DATE);
    assert.equal(result.characterization, "moderate");
  });

  it("returns moderate for two commits between 121 and 180 days ago", () => {
    const result = characterizeFamiliarity(2, 10, daysAgo(150), 0, 0, REFERENCE_DATE);
    assert.equal(result.characterization, "moderate");
  });

  it("returns none for zero commits", () => {
    const result = characterizeFamiliarity(0, 5, null, 0, 0, REFERENCE_DATE);
    assert.equal(result.characterization, "none");
    assert.equal(result.shareOfFileCommitChurn, 0);
  });

  it("returns none for a single stale commit beyond 120 days", () => {
    const result = characterizeFamiliarity(1, 5, daysAgo(130), 0, 0, REFERENCE_DATE);
    assert.equal(result.characterization, "none");
  });

  it("returns none when last touch is beyond 180 days regardless of commit count", () => {
    const result = characterizeFamiliarity(10, 20, daysAgo(200), 0, 0, REFERENCE_DATE);
    assert.equal(result.characterization, "none");
  });

  it("cannot return high when last touch is beyond 60 days even with many commits", () => {
    const result = characterizeFamiliarity(10, 10, daysAgo(90), 0, 0, REFERENCE_DATE);
    assert.equal(result.characterization, "moderate");
  });

  it("cannot return high for stale high line ownership without recent touch", () => {
    const result = characterizeFamiliarity(1, 5, daysAgo(90), 0.9, 0.9, REFERENCE_DATE);
    assert.equal(result.characterization, "moderate");
  });

  it("returns none for high line ownership when last touch is beyond 180 days", () => {
    const result = characterizeFamiliarity(1, 5, daysAgo(200), 0.9, 0.9, REFERENCE_DATE);
    assert.equal(result.characterization, "none");
  });
});

describe("analyzeFamiliarity characterization", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-familiarity-slice3-")
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

    writeRepoFile(repoPath, "src/foo.ts", "export const foo = 5;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(10),
      "alice recent foo"
    );

    writeRepoFile(repoPath, "src/bar.ts", "export const bar = 1;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(5),
      "alice bar only"
    );

    writeRepoFile(repoPath, "lib/util.ts", "export const util = 1;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(20),
      "alice lib util"
    );

    writeRepoFile(repoPath, "lib/util.ts", "export const util = 2;\n");
    commitAs(
      repoPath,
      { name: "Bob Builder", email: "bob@example.com" },
      daysAgo(15),
      "bob lib util"
    );
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("computes share and moderate characterization for active files without line signals", () => {
    const historySource = createGitHistorySource(repoPath);
    const findings = analyzeFamiliarity(
      {
        author: { name: "Alice Author", email: "alice@example.com" },
        touchedPaths: ["src/foo.ts"],
        historySource,
      },
      REFERENCE_DATE
    );

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.authorCommitCount, 2);
    assert.equal(findings[0]?.totalFileCommitCount, 4);
    assert.equal(findings[0]?.shareOfFileCommitChurn, 0.5);
    assert.equal(findings[0]?.characterization, "moderate");
  });

  it("retains supporting numbers alongside the characterization label", () => {
    const historySource = createGitHistorySource(repoPath);
    const findings = analyzeFamiliarity(
      {
        author: { name: "Alice Author", email: "alice@example.com" },
        touchedPaths: ["lib/util.ts"],
        historySource,
      },
      REFERENCE_DATE
    );

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.authorCommitCount, 1);
    assert.equal(findings[0]?.totalFileCommitCount, 2);
    assert.equal(findings[0]?.shareOfFileCommitChurn, 0.5);
    assert.equal(findings[0]?.characterization, "moderate");
    assert.deepEqual(findings[0]?.lastTouchDate, daysAgo(20));
  });

  it("returns none for authors with no commits in the window", () => {
    const historySource = createGitHistorySource(repoPath);
    const findings = analyzeFamiliarity(
      {
        author: { name: "Charlie Coder", email: "charlie@example.com" },
        touchedPaths: ["src/foo.ts"],
        historySource,
      },
      REFERENCE_DATE
    );

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.authorCommitCount, 0);
    assert.equal(findings[0]?.characterization, "none");
    assert.equal(findings[0]?.shareOfFileCommitChurn, 0);
  });
});
