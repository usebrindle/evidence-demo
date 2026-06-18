import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { resolveChangedFiles } from "../src/inputs/changedFiles.js";

function git(repoPath: string, args: readonly string[]): string {
  return execFileSync("git", args as string[], {
    cwd: repoPath,
    encoding: "utf8",
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

function assertValidSha(sha: string): void {
  assert.match(sha, /^[0-9a-f]{40}$/, "expected a full 40-character git SHA");
}

describe("resolveChangedFiles", () => {
  let repoPath = "";
  let mainCommit = "";
  let featureCommit = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-changed-files-")
    );
    git(repoPath, ["init"]);
    git(repoPath, ["config", "user.name", "Alice Author"]);
    git(repoPath, ["config", "user.email", "alice@example.com"]);

    writeRepoFile(repoPath, "README.md", "main readme\n");
    git(repoPath, ["add", "README.md"]);
    git(repoPath, ["commit", "-m", "init main"]);
    mainCommit = git(repoPath, ["rev-parse", "HEAD"]);

    git(repoPath, ["checkout", "-b", "feature/auth"]);
    writeRepoFile(repoPath, "src/auth.ts", "export const auth = true;\n");
    writeRepoFile(repoPath, "docs/auth.md", "auth docs\n");
    git(repoPath, ["add", "."]);
    git(repoPath, ["commit", "-m", "add auth module"]);
    featureCommit = git(repoPath, ["rev-parse", "HEAD"]);

    git(repoPath, ["update-ref", "refs/pull/42/head", featureCommit]);
    git(repoPath, [
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/heads/main",
    ]);
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("resolves a base...head commit range", () => {
    const result = resolveChangedFiles({
      repoPath,
      prOrRange: "main...feature/auth",
    });

    assert.deepEqual(result.changedFiles.sort(), [
      "docs/auth.md",
      "src/auth.ts",
    ]);
    assert.equal(result.author.name, "Alice Author");
    assert.equal(result.author.email, "alice@example.com");
    assertValidSha(result.headRevision);
    assert.equal(result.headRevision, featureCommit);
  });

  it("resolves a branch name against the default branch", () => {
    const result = resolveChangedFiles({
      repoPath,
      prOrRange: "feature/auth",
    });

    assert.deepEqual(result.changedFiles.sort(), [
      "docs/auth.md",
      "src/auth.ts",
    ]);
    assert.equal(result.author.email, "alice@example.com");
    assertValidSha(result.headRevision);
    assert.equal(result.headRevision, featureCommit);
  });

  it("resolves a locally available pull request ref", () => {
    const result = resolveChangedFiles({
      repoPath,
      prOrRange: "42",
    });

    assert.deepEqual(result.changedFiles.sort(), [
      "docs/auth.md",
      "src/auth.ts",
    ]);
    assert.equal(result.author.name, "Alice Author");
    assertValidSha(result.headRevision);
    assert.equal(result.headRevision, featureCommit);
  });

  it("returns an empty list when the range has no file changes", () => {
    const result = resolveChangedFiles({
      repoPath,
      prOrRange: `${mainCommit}...${mainCommit}`,
    });

    assert.deepEqual(result.changedFiles, []);
    assert.equal(result.author.email, "alice@example.com");
    assertValidSha(result.headRevision);
    assert.equal(result.headRevision, mainCommit);
  });
});
