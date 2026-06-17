import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { countDirectImportersForFile } from "../src/analyzers/blastRadius.js";
import { createImportGraph } from "../src/inputs/importGraphSource.js";

function writeRepoFile(
  repoPath: string,
  relativePath: string,
  contents: string
): void {
  const fullPath = path.join(repoPath, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

describe("countDirectImportersForFile", () => {
  it("returns zero dependents when a file has no importers", () => {
    const graph = new Map([
      ["src/util.ts", ["src/a.ts", "src/b.ts"]],
    ]);

    const result = countDirectImportersForFile("src/helper.ts", graph);

    assert.equal(result.dependentCount, 0);
    assert.deepEqual(result.dependents, []);
  });

  it("returns direct importer count and paths from the import graph", () => {
    const graph = new Map([
      [
        "src/util.ts",
        ["src/a.ts", "src/b.ts", "src/nested/c.ts"],
      ],
    ]);

    const result = countDirectImportersForFile("src/util.ts", graph);

    assert.equal(result.dependentCount, 3);
    assert.deepEqual(result.dependents, [
      "src/a.ts",
      "src/b.ts",
      "src/nested/c.ts",
    ]);
  });

  it("normalizes Windows-style path separators", () => {
    const graph = new Map([["src/util.ts", ["src/a.ts"]]]);

    const result = countDirectImportersForFile("src\\util.ts", graph);

    assert.equal(result.dependentCount, 1);
    assert.deepEqual(result.dependents, ["src/a.ts"]);
  });
});

describe("countDirectImportersForFile integration", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-blast-radius-")
    );

    writeRepoFile(
      repoPath,
      "src/util.ts",
      "export const util = 1;\n"
    );
    writeRepoFile(
      repoPath,
      "src/a.ts",
      "import { util } from './util';\nexport const a = util;\n"
    );
    writeRepoFile(
      repoPath,
      "src/b.ts",
      "import { util } from './util';\nexport const b = util;\n"
    );
    writeRepoFile(
      repoPath,
      "src/nested/c.ts",
      "import { util } from '../util';\nexport const c = util;\n"
    );
    writeRepoFile(
      repoPath,
      "src/reexport.ts",
      "export { util } from './util';\n"
    );
    writeRepoFile(
      repoPath,
      "src/dynamic.ts",
      "export async function load() {\n  return import('./util');\n}\n"
    );
    writeRepoFile(
      repoPath,
      "src/isolated.ts",
      "export const isolated = true;\n"
    );
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("counts direct importers from a real TypeScript repo import graph", () => {
    const graph = createImportGraph(repoPath);

    const result = countDirectImportersForFile("src/util.ts", graph);

    assert.equal(result.dependentCount, 5);
    assert.deepEqual(result.dependents, [
      "src/a.ts",
      "src/b.ts",
      "src/dynamic.ts",
      "src/nested/c.ts",
      "src/reexport.ts",
    ]);
  });

  it("returns zero dependents for an isolated changed file", () => {
    const graph = createImportGraph(repoPath);

    const result = countDirectImportersForFile("src/isolated.ts", graph);

    assert.equal(result.dependentCount, 0);
    assert.deepEqual(result.dependents, []);
  });
});
