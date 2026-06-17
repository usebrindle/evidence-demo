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
  shareOfAreaChurn,
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

  it("aggregates author commit counts at the directory level", () => {
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
    assert.equal(findings[0]?.area, "src/");
    assert.equal(findings[0]?.authorCommitCount, 3);
    assert.equal(findings[0]?.totalAreaCommitCount, 5);
  });

  it("includes the author's most recent commit date to each area", () => {
    const historySource = createGitHistorySource(repoPath);
    const findings = analyzeFamiliarity(
      {
        author: { name: "Alice Author", email: "alice@example.com" },
        touchedPaths: ["src/foo.ts", "src/bar.ts"],
        historySource,
      },
      REFERENCE_DATE
    );

    assert.equal(findings.length, 1);
    assert.deepEqual(findings[0]?.lastTouchDate, daysAgo(5));
  });

  it("returns one finding per unique touched area", () => {
    const historySource = createGitHistorySource(repoPath);
    const findings = analyzeFamiliarity(
      {
        author: { name: "Alice Author", email: "alice@example.com" },
        touchedPaths: ["src/foo.ts", "src/bar.ts", "lib/util.ts"],
        historySource,
      },
      REFERENCE_DATE
    );

    assert.equal(findings.length, 2);
    const areas = findings.map((finding) => finding.area).sort();
    assert.deepEqual(areas, ["lib/", "src/"]);
  });

  it("returns structured findings with supporting counts per area", () => {
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
    assert.equal(findings[0]?.area, "lib/");
    assert.equal(findings[0]?.authorCommitCount, 1);
    assert.equal(findings[0]?.totalAreaCommitCount, 2);
    assert.deepEqual(findings[0]?.lastTouchDate, daysAgo(20));
  });
});

describe("shareOfAreaChurn", () => {
  it("returns author commits divided by total area commits", () => {
    assert.equal(shareOfAreaChurn(3, 12), 0.25);
  });

  it("returns zero when the area has no churn", () => {
    assert.equal(shareOfAreaChurn(0, 0), 0);
  });
});

describe("characterizeFamiliarity", () => {
  it("returns high when recent with enough commits", () => {
    const result = characterizeFamiliarity(3, 10, daysAgo(30), REFERENCE_DATE);
    assert.equal(result.characterization, "high");
    assert.equal(result.shareOfAreaChurn, 0.3);
  });

  it("returns high when recent with high share but fewer than 3 commits", () => {
    const result = characterizeFamiliarity(2, 6, daysAgo(45), REFERENCE_DATE);
    assert.equal(result.characterization, "high");
    assert.equal(result.shareOfAreaChurn, 1 / 3);
  });

  it("returns moderate when recent with one commit below high thresholds", () => {
    const result = characterizeFamiliarity(1, 20, daysAgo(90), REFERENCE_DATE);
    assert.equal(result.characterization, "moderate");
    assert.equal(result.shareOfAreaChurn, 0.05);
  });

  it("returns moderate for two commits between 121 and 180 days ago", () => {
    const result = characterizeFamiliarity(2, 10, daysAgo(150), REFERENCE_DATE);
    assert.equal(result.characterization, "moderate");
  });

  it("returns none for zero commits", () => {
    const result = characterizeFamiliarity(0, 5, null, REFERENCE_DATE);
    assert.equal(result.characterization, "none");
    assert.equal(result.shareOfAreaChurn, 0);
  });

  it("returns none for a single stale commit beyond 120 days", () => {
    const result = characterizeFamiliarity(1, 5, daysAgo(130), REFERENCE_DATE);
    assert.equal(result.characterization, "none");
  });

  it("returns none when last touch is beyond 180 days regardless of commit count", () => {
    const result = characterizeFamiliarity(10, 20, daysAgo(200), REFERENCE_DATE);
    assert.equal(result.characterization, "none");
  });

  it("cannot return high when last touch is beyond 60 days even with many commits", () => {
    const result = characterizeFamiliarity(10, 10, daysAgo(90), REFERENCE_DATE);
    assert.equal(result.characterization, "moderate");
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

  it("computes share and high characterization for active areas", () => {
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
    assert.equal(findings[0]?.authorCommitCount, 3);
    assert.equal(findings[0]?.totalAreaCommitCount, 5);
    assert.equal(findings[0]?.shareOfAreaChurn, 0.6);
    assert.equal(findings[0]?.characterization, "high");
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
    assert.equal(findings[0]?.totalAreaCommitCount, 2);
    assert.equal(findings[0]?.shareOfAreaChurn, 0.5);
    assert.equal(findings[0]?.characterization, "high");
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
    assert.equal(findings[0]?.shareOfAreaChurn, 0);
  });
});
