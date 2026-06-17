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
    writeRepoFile(
      repoPath,
      "src/login.ts",
      "import { auth } from './auth';\nexport const login = auth;\n"
    );
    writeRepoFile(
      repoPath,
      "src/signup.ts",
      "import { auth } from './auth';\nexport const signup = auth;\n"
    );
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

  it("prints a complete report for a commit range", () => {
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
    assert.match(output, /Blast Radius/);
    assert.match(output, /src\/auth\.ts — isolated/);
    assert.match(output, /Imported by 2 modules, including src\/login\.ts, src\/signup\.ts/);
    assert.match(output, /Limitations/);
    assert.doesNotMatch(output, /no TypeScript changed files to analyze/);
  });

  it("prints a complete report for a branch name", () => {
    const output = runEvidenceDemo(repoPath, "feature/auth", {
      asOf: REFERENCE_DATE,
    });

    assert.match(output, /Author: Alice Author <alice@example.com>/);
    assert.match(output, /src\/ —/);
    assert.match(output, /Changed files: 3/);
    assert.match(output, /src\/auth\.ts — isolated/);
    assert.match(output, /Imported by 2 modules/);
  });

  it("lists non-TypeScript changed files under not-analyzed for blast radius", () => {
    writeRepoFile(repoPath, "docs/guide.md", "# Guide\n");
    commitAs(
      repoPath,
      { name: "Alice Author", email: "alice@example.com" },
      daysAgo(5),
      "alice adds guide"
    );
    const head = git(repoPath, ["rev-parse", "HEAD"]);

    const output = runEvidenceDemo(repoPath, `${mainCommit}...${head}`, {
      asOf: REFERENCE_DATE,
    });

    assert.match(output, /Not Analyzed for Blast Radius/);
    assert.match(output, /docs\/guide\.md/);
    assert.match(output, /Blast-radius analysis covers TypeScript static imports only/);
    assert.match(output, /src\/auth\.ts — isolated/);
  });

  it("produces a complete end-to-end report against a TypeScript repo with importers", () => {
    const e2eRepo = mkdtempSync(path.join(os.tmpdir(), "evidence-demo-e2e-"));
    try {
      git(e2eRepo, ["init"]);
      git(e2eRepo, ["config", "user.name", "Setup"]);
      git(e2eRepo, ["config", "user.email", "setup@example.com"]);

      writeRepoFile(e2eRepo, "src/core.ts", "export const core = 1;\n");
      writeRepoFile(
        e2eRepo,
        "src/a.ts",
        "import { core } from './core';\nexport const a = core;\n"
      );
      writeRepoFile(
        e2eRepo,
        "src/b.ts",
        "import { core } from './core';\nexport const b = core;\n"
      );
      writeRepoFile(
        e2eRepo,
        "src/c.ts",
        "import { core } from './core';\nexport const c = core;\n"
      );
      commitAs(
        e2eRepo,
        { name: "Carol Core", email: "carol@example.com" },
        daysAgo(90),
        "init core"
      );
      const base = git(e2eRepo, ["rev-parse", "HEAD"]);

      writeRepoFile(e2eRepo, "src/core.ts", "export const core = 2;\n");
      commitAs(
        e2eRepo,
        { name: "Dev User", email: "dev@example.com" },
        daysAgo(15),
        "dev updates core"
      );
      const head = git(e2eRepo, ["rev-parse", "HEAD"]);

      const output = runEvidenceDemo(e2eRepo, `${base}...${head}`, {
        asOf: REFERENCE_DATE,
      });

      assert.match(output, /Author: Dev User <dev@example.com>/);
      assert.match(output, /Familiarity/);
      assert.match(output, /src\/ —/);
      assert.match(output, /Blast Radius/);
      assert.match(output, /src\/core\.ts — moderate/);
      assert.match(output, /Imported by 3 modules/);
      assert.match(output, /Limitations/);
      assert.doesNotMatch(output, /Not Analyzed for Blast Radius/);
    } finally {
      rmSync(e2eRepo, { recursive: true, force: true });
    }
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
