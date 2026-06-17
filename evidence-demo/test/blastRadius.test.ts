import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import {
  analyzeBlastRadius,
  characterizeBlastRadius,
  countDirectImportersForFile,
  DEPENDENT_SAMPLE_SIZE,
  sampleDependents,
} from "../src/analyzers/blastRadius.js";
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

describe("characterizeBlastRadius", () => {
  it("labels 0-2 direct importers as isolated", () => {
    assert.equal(characterizeBlastRadius(0), "isolated");
    assert.equal(characterizeBlastRadius(1), "isolated");
    assert.equal(characterizeBlastRadius(2), "isolated");
  });

  it("labels 3-10 direct importers as moderate", () => {
    assert.equal(characterizeBlastRadius(3), "moderate");
    assert.equal(characterizeBlastRadius(10), "moderate");
  });

  it("labels 11+ direct importers as broad", () => {
    assert.equal(characterizeBlastRadius(11), "broad");
    assert.equal(characterizeBlastRadius(34), "broad");
  });
});

describe("sampleDependents", () => {
  it("returns all dependents when count is within the sample size", () => {
    const dependents = ["src/a.ts", "src/b.ts"];

    assert.deepEqual(sampleDependents(dependents), dependents);
  });

  it("returns the first N dependents when there are more than the sample size", () => {
    const dependents = Array.from({ length: 12 }, (_, index) => `src/m${index}.ts`);

    const sample = sampleDependents(dependents);

    assert.equal(sample.length, DEPENDENT_SAMPLE_SIZE);
    assert.deepEqual(sample, dependents.slice(0, DEPENDENT_SAMPLE_SIZE));
  });
});

describe("analyzeBlastRadius", () => {
  it("returns structured findings with characterization and dependent samples", () => {
    const importers = Array.from({ length: 12 }, (_, index) => `src/m${index}.ts`);
    const graph = new Map([
      ["src/hub.ts", importers],
      ["src/leaf.ts", ["src/only.ts"]],
    ]);

    const findings = analyzeBlastRadius({
      changedFiles: ["src/hub.ts", "src/leaf.ts", "README.md"],
      importGraph: graph,
    });

    assert.equal(findings.length, 2);

    const hub = findings.find((finding) => finding.changedFile === "src/hub.ts");
    assert.ok(hub);
    assert.equal(hub.dependentCount, 12);
    assert.equal(hub.characterization, "broad");
    assert.equal(hub.dependents.length, DEPENDENT_SAMPLE_SIZE);
    assert.deepEqual(hub.dependents, importers.slice(0, DEPENDENT_SAMPLE_SIZE));

    const leaf = findings.find((finding) => finding.changedFile === "src/leaf.ts");
    assert.ok(leaf);
    assert.equal(leaf.dependentCount, 1);
    assert.equal(leaf.characterization, "isolated");
    assert.deepEqual(leaf.dependents, ["src/only.ts"]);
  });

  it("skips non-analyzable changed files", () => {
    const graph = new Map<string, readonly string[]>();

    const findings = analyzeBlastRadius({
      changedFiles: ["docs/guide.md", "package.json", "styles/main.css"],
      importGraph: graph,
    });

    assert.deepEqual(findings, []);
  });

  it("returns findings for changed JavaScript and JSX files", () => {
    const graph = new Map([
      ["src/util.js", ["src/a.js", "src/b.jsx"]],
      ["src/widget.jsx", ["src/app.jsx"]],
    ]);

    const findings = analyzeBlastRadius({
      changedFiles: ["src/util.js", "src/widget.jsx", "README.md"],
      importGraph: graph,
    });

    assert.equal(findings.length, 2);

    const util = findings.find((finding) => finding.changedFile === "src/util.js");
    assert.ok(util);
    assert.equal(util.dependentCount, 2);
    assert.equal(util.characterization, "isolated");
    assert.deepEqual(util.dependents, ["src/a.js", "src/b.jsx"]);

    const widget = findings.find(
      (finding) => finding.changedFile === "src/widget.jsx"
    );
    assert.ok(widget);
    assert.equal(widget.dependentCount, 1);
    assert.equal(widget.characterization, "isolated");
    assert.deepEqual(widget.dependents, ["src/app.jsx"]);
  });
});

describe("analyzeBlastRadius integration", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-blast-radius-analyze-")
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

  it("produces findings from a real TypeScript repo import graph", () => {
    const graph = createImportGraph(repoPath);

    const findings = analyzeBlastRadius({
      changedFiles: ["src/util.ts", "src/isolated.ts", "README.md"],
      importGraph: graph,
    });

    assert.equal(findings.length, 2);

    const utilFinding = findings.find(
      (finding) => finding.changedFile === "src/util.ts"
    );
    assert.ok(utilFinding);
    assert.equal(utilFinding.dependentCount, 5);
    assert.equal(utilFinding.characterization, "moderate");
    assert.deepEqual(utilFinding.dependents, [
      "src/a.ts",
      "src/b.ts",
      "src/dynamic.ts",
      "src/nested/c.ts",
      "src/reexport.ts",
    ]);

    const isolatedFinding = findings.find(
      (finding) => finding.changedFile === "src/isolated.ts"
    );
    assert.ok(isolatedFinding);
    assert.equal(isolatedFinding.dependentCount, 0);
    assert.equal(isolatedFinding.characterization, "isolated");
    assert.deepEqual(isolatedFinding.dependents, []);
  });
});

describe("analyzeBlastRadius path alias integration", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-blast-radius-alias-")
    );

    writeRepoFile(
      repoPath,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@lib/*": ["src/lib/*"],
          },
        },
      })
    );
    writeRepoFile(
      repoPath,
      "src/lib/util.ts",
      "export const util = 1;\n"
    );
    writeRepoFile(
      repoPath,
      "src/alias-a.ts",
      "import { util } from '@lib/util';\nexport const a = util;\n"
    );
    writeRepoFile(
      repoPath,
      "src/alias-b.ts",
      "import { util } from '@lib/util';\nexport const b = util;\n"
    );
    writeRepoFile(
      repoPath,
      "src/alias-c.ts",
      "import { util } from '@lib/util';\nexport const c = util;\n"
    );
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("counts alias-resolved importers for blast-radius findings", () => {
    const graph = createImportGraph(repoPath);

    const findings = analyzeBlastRadius({
      changedFiles: ["src/lib/util.ts"],
      importGraph: graph,
    });

    assert.equal(findings.length, 1);
    assert.equal(findings[0].dependentCount, 3);
    assert.equal(findings[0].characterization, "moderate");
    assert.deepEqual(findings[0].dependents, [
      "src/alias-a.ts",
      "src/alias-b.ts",
      "src/alias-c.ts",
    ]);
  });
});

describe("analyzeBlastRadius JavaScript integration", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-blast-radius-js-")
    );

    writeRepoFile(
      repoPath,
      "src/util.js",
      "export const util = 1;\n"
    );
    writeRepoFile(
      repoPath,
      "src/a.js",
      "import { util } from './util.js';\nexport const a = util;\n"
    );
    writeRepoFile(
      repoPath,
      "src/b.jsx",
      "import { util } from './util.js';\nexport const b = util;\n"
    );
    writeRepoFile(
      repoPath,
      "src/isolated.mjs",
      "export const isolated = true;\n"
    );
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("produces findings for changed JavaScript files from a real import graph", () => {
    const graph = createImportGraph(repoPath);

    const findings = analyzeBlastRadius({
      changedFiles: ["src/util.js", "src/isolated.mjs", "package.json"],
      importGraph: graph,
    });

    assert.equal(findings.length, 2);

    const utilFinding = findings.find(
      (finding) => finding.changedFile === "src/util.js"
    );
    assert.ok(utilFinding);
    assert.equal(utilFinding.dependentCount, 2);
    assert.equal(utilFinding.characterization, "isolated");
    assert.deepEqual(utilFinding.dependents, ["src/a.js", "src/b.jsx"]);

    const isolatedFinding = findings.find(
      (finding) => finding.changedFile === "src/isolated.mjs"
    );
    assert.ok(isolatedFinding);
    assert.equal(isolatedFinding.dependentCount, 0);
    assert.equal(isolatedFinding.characterization, "isolated");
    assert.deepEqual(isolatedFinding.dependents, []);
  });
});

describe("analyzeBlastRadius require() integration", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-blast-radius-require-")
    );

    writeRepoFile(
      repoPath,
      "src/util.js",
      "module.exports = { util: 1 };\n"
    );
    writeRepoFile(
      repoPath,
      "src/consumer-a.js",
      "const { util } = require('./util');\nmodule.exports = { a: util };\n"
    );
    writeRepoFile(
      repoPath,
      "src/consumer-b.js",
      "const { util } = require('./util');\nmodule.exports = { b: util };\n"
    );
    writeRepoFile(
      repoPath,
      "src/isolated.js",
      "module.exports = { isolated: true };\n"
    );
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("counts require-only dependents in blast-radius findings", () => {
    const graph = createImportGraph(repoPath);

    const findings = analyzeBlastRadius({
      changedFiles: ["src/util.js", "src/isolated.js"],
      importGraph: graph,
    });

    assert.equal(findings.length, 2);

    const utilFinding = findings.find(
      (finding) => finding.changedFile === "src/util.js"
    );
    assert.ok(utilFinding);
    assert.equal(utilFinding.dependentCount, 2);
    assert.equal(utilFinding.characterization, "isolated");
    assert.deepEqual(utilFinding.dependents, [
      "src/consumer-a.js",
      "src/consumer-b.js",
    ]);

    const isolatedFinding = findings.find(
      (finding) => finding.changedFile === "src/isolated.js"
    );
    assert.ok(isolatedFinding);
    assert.equal(isolatedFinding.dependentCount, 0);
    assert.equal(isolatedFinding.characterization, "isolated");
    assert.deepEqual(isolatedFinding.dependents, []);
  });

  it("merges import and require dependents on the same changed file", () => {
    const mixedRepo = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-blast-radius-require-mixed-")
    );
    try {
      writeRepoFile(
        mixedRepo,
        "src/util.js",
        "module.exports = { util: 1 };\n"
      );
      writeRepoFile(
        mixedRepo,
        "src/mixed-import.js",
        "import { util } from './util.js';\nexport const imported = util;\n"
      );
      writeRepoFile(
        mixedRepo,
        "src/mixed-require.js",
        "const { util } = require('./util');\nmodule.exports = { required: util };\n"
      );

      const graph = createImportGraph(mixedRepo);
      const result = countDirectImportersForFile("src/util.js", graph);

      assert.equal(result.dependentCount, 2);
      assert.deepEqual(result.dependents, [
        "src/mixed-import.js",
        "src/mixed-require.js",
      ]);
    } finally {
      rmSync(mixedRepo, { recursive: true, force: true });
    }
  });
});
