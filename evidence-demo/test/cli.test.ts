import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { main, runEvidenceDemo } from "../src/cli.js";

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
  git(repoPath, ["commit", "-m", message], {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_AUTHOR_DATE: date.toISOString(),
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
    GIT_COMMITTER_DATE: date.toISOString(),
  });
}

describe("runEvidenceDemo", () => {
  let repoPath = "";
  let mainCommit = "";
  let featureCommit = "";

  before(() => {
    repoPath = mkdtempSync(path.join(os.tmpdir(), "evidence-demo-cli-"));
    git(repoPath, ["init"]);
    git(repoPath, ["config", "user.name", "Setup"]);
    git(repoPath, ["config", "user.email", "setup@example.com"]);

    writeRepoFile(repoPath, "README.md", "main readme\n");
    commitAs(
      repoPath,
      { name: "Bob Builder", email: "bob@example.com" },
      daysAgo(200),
      "init main"
    );
    mainCommit = git(repoPath, ["rev-parse", "HEAD"]);

    git(repoPath, ["checkout", "-b", "feature/auth"]);
    writeRepoFile(repoPath, "src/auth.ts", "export const auth = true;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(30),
      "alice adds auth"
    );

    writeRepoFile(repoPath, "src/auth.ts", "export const auth = 2;\n");
    commitAs(
      repoPath,
      { name: "Bob Builder", email: "bob@example.com" },
      daysAgo(20),
      "bob updates auth"
    );

    writeRepoFile(repoPath, "src/auth.ts", "export const auth = 3;\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(10),
      "alice updates auth again"
    );
    featureCommit = git(repoPath, ["rev-parse", "HEAD"]);

    git(repoPath, [
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/heads/main",
    ]);
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("prints a familiarity report for a commit range", () => {
    const output = runEvidenceDemo(
      repoPath,
      `${mainCommit}...${featureCommit}`,
      { asOf: REFERENCE_DATE }
    );

    assert.match(output, /Evidence Report/);
    assert.match(output, /Author: Alice Author <alice@example.com>/);
    assert.match(output, /Familiarity/);
    assert.match(output, /src\/ — (high|moderate|none)/);
    assert.match(output, /Author has 2 commits here in 6 months/);
    assert.match(output, /Limitations/);
    assert.match(output, /no TypeScript changed files to analyze/);
  });

  it("prints a familiarity report for a branch name", () => {
    const output = runEvidenceDemo(repoPath, "feature/auth", {
      asOf: REFERENCE_DATE,
    });

    assert.match(output, /Author: Alice Author <alice@example.com>/);
    assert.match(output, /src\/ —/);
    assert.match(output, /Changed files: 1/);
  });
});

describe("main", () => {
  it("prints help when no arguments are provided", () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      logs.push(String(message));
    };

    try {
      main([]);
    } finally {
      console.log = originalLog;
    }

    assert.match(logs.join("\n"), /Usage: evidence-demo/);
  });
});
