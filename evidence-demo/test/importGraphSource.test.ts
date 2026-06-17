import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

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

describe("createImportGraph", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-import-graph-")
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
      "src/helper.ts",
      "export const helper = true;\n"
    );
    writeRepoFile(
      repoPath,
      "src/extensionless.ts",
      "import { helper } from './helper';\nexport const value = helper;\n"
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
      "src/external.ts",
      "import fs from 'node:fs';\nexport const read = fs.readFileSync;\n"
    );
    writeRepoFile(
      repoPath,
      "node_modules/ignored/pkg.ts",
      "import { util } from '../../src/util';\nexport const ignored = util;\n"
    );
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("builds reverse-dependency map for relative imports", () => {
    const graph = createImportGraph(repoPath);

    assert.deepEqual(graph.get("src/util.ts"), [
      "src/a.ts",
      "src/b.ts",
      "src/dynamic.ts",
      "src/nested/c.ts",
      "src/reexport.ts",
    ]);
  });

  it("resolves extensionless relative imports", () => {
    const graph = createImportGraph(repoPath);

    assert.deepEqual(graph.get("src/helper.ts"), ["src/extensionless.ts"]);
  });

  it("ignores package and node built-in imports", () => {
    const graph = createImportGraph(repoPath);

    assert.equal(graph.has("node:fs"), false);
    assert.equal(graph.has("src/external.ts"), false);
  });

  it("skips node_modules when scanning the repo", () => {
    const graph = createImportGraph(repoPath);

    assert.equal(graph.get("src/util.ts")?.includes("node_modules/ignored/pkg.ts"), false);
  });
});

describe("createImportGraph path aliases", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-import-graph-alias-")
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
      "src/relative.ts",
      "import { util } from './lib/util';\nexport const relative = util;\n"
    );
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("resolves tsconfig path aliases to repo modules", () => {
    const graph = createImportGraph(repoPath);

    assert.deepEqual(graph.get("src/lib/util.ts"), [
      "src/alias-a.ts",
      "src/alias-b.ts",
      "src/relative.ts",
    ]);
  });
});

describe("createImportGraph JavaScript files", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-import-graph-js-")
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
      "src/b.js",
      "import { util } from './util';\nexport const b = util;\n"
    );
    writeRepoFile(
      repoPath,
      "src/components/Button.jsx",
      "export function Button() { return null; }\n"
    );
    writeRepoFile(
      repoPath,
      "src/components/App.jsx",
      "import { Button } from './Button.jsx';\nexport function App() { return Button(); }\n"
    );
    writeRepoFile(
      repoPath,
      "src/components/Card.jsx",
      "import { Button } from './Button';\nexport function Card() { return Button(); }\n"
    );
    writeRepoFile(
      repoPath,
      "src/legacy/config.js",
      "export const config = { api: true };\n"
    );
    writeRepoFile(
      repoPath,
      "src/consumer.ts",
      "import { config } from './legacy/config.js';\nexport const enabled = config.api;\n"
    );
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("builds reverse-dependency map for .js importing .js", () => {
    const graph = createImportGraph(repoPath);

    assert.deepEqual(graph.get("src/util.js"), ["src/a.js", "src/b.js"]);
  });

  it("builds reverse-dependency map for .jsx importing .jsx", () => {
    const graph = createImportGraph(repoPath);

    assert.deepEqual(graph.get("src/components/Button.jsx"), [
      "src/components/App.jsx",
      "src/components/Card.jsx",
    ]);
  });

  it("resolves mixed .ts to .js import chain", () => {
    const graph = createImportGraph(repoPath);

    assert.deepEqual(graph.get("src/legacy/config.js"), ["src/consumer.ts"]);
  });
});
