import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import {
  collectSourceFiles,
  createImportGraph,
  isAnalyzableSourceFile,
} from "../src/inputs/importGraphSource.js";
import { countDirectImportersForFile } from "../src/analyzers/blastRadius.js";

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

describe("createImportGraph require()", () => {
  describe("basic .js require", () => {
    let repoPath = "";

    before(() => {
      repoPath = mkdtempSync(
        path.join(os.tmpdir(), "evidence-demo-import-graph-require-basic-")
      );

      writeRepoFile(
        repoPath,
        "src/util.js",
        "module.exports = { util: 1 };\n"
      );
      writeRepoFile(
        repoPath,
        "src/consumer.js",
        "const { util } = require('./util');\nmodule.exports = { value: util };\n"
      );
    });

    after(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it("builds reverse-dependency map for .js required by another .js file", () => {
      const graph = createImportGraph(repoPath);

      assert.deepEqual(graph.get("src/util.js"), ["src/consumer.js"]);
    });
  });

  describe("mixed import and require", () => {
    let repoPath = "";

    before(() => {
      repoPath = mkdtempSync(
        path.join(os.tmpdir(), "evidence-demo-import-graph-require-mixed-")
      );

      writeRepoFile(
        repoPath,
        "src/util.js",
        "module.exports = { util: 1 };\n"
      );
      writeRepoFile(
        repoPath,
        "src/mixed-import.js",
        "import { util } from './util.js';\nexport const imported = util;\n"
      );
      writeRepoFile(
        repoPath,
        "src/mixed-require.js",
        "const { util } = require('./util');\nmodule.exports = { required: util };\n"
      );
    });

    after(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it("merges import and require dependents on the same target", () => {
      const graph = createImportGraph(repoPath);

      assert.deepEqual(graph.get("src/util.js"), [
        "src/mixed-import.js",
        "src/mixed-require.js",
      ]);
    });
  });

  describe("dynamic require and aliases", () => {
    let repoPath = "";

    before(() => {
      repoPath = mkdtempSync(
        path.join(os.tmpdir(), "evidence-demo-import-graph-require-dynamic-")
      );

      writeRepoFile(
        repoPath,
        "src/util.js",
        "module.exports = { util: 1 };\n"
      );
      writeRepoFile(
        repoPath,
        "src/dynamic-require.js",
        "function load(name) {\n  return require(name);\n}\nmodule.exports = { load };\n"
      );
      writeRepoFile(
        repoPath,
        "src/alias-target.js",
        "module.exports = { alias: true };\n"
      );
      writeRepoFile(
        repoPath,
        "tsconfig.json",
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: {
              "@lib/*": ["src/*"],
            },
          },
        })
      );
      writeRepoFile(
        repoPath,
        "src/alias-require.js",
        "const target = require('@lib/alias-target');\nmodule.exports = target;\n"
      );
    });

    after(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it("does not create edges for dynamic require(variable)", () => {
      const graph = createImportGraph(repoPath);

      assert.equal(graph.has("src/dynamic-require.js"), false);
      assert.equal(graph.get("src/util.js"), undefined);
    });

    it("resolves require specifiers with tsconfig path aliases", () => {
      const graph = createImportGraph(repoPath);

      assert.deepEqual(graph.get("src/alias-target.js"), ["src/alias-require.js"]);
    });
  });
});

describe("isAnalyzableSourceFile", () => {
  it("returns true for stylesheet extensions", () => {
    assert.equal(isAnalyzableSourceFile("styles/main.css"), true);
    assert.equal(isAnalyzableSourceFile("styles/theme.scss"), true);
    assert.equal(isAnalyzableSourceFile("styles/_tokens.sass"), true);
    assert.equal(isAnalyzableSourceFile("src/Button.module.css"), true);
  });

  it("returns true for existing JS/TS extensions", () => {
    assert.equal(isAnalyzableSourceFile("src/util.ts"), true);
    assert.equal(isAnalyzableSourceFile("src/util.tsx"), true);
    assert.equal(isAnalyzableSourceFile("src/util.js"), true);
    assert.equal(isAnalyzableSourceFile("src/util.jsx"), true);
    assert.equal(isAnalyzableSourceFile("src/util.mjs"), true);
    assert.equal(isAnalyzableSourceFile("src/util.cjs"), true);
  });

  it("returns false for non-source files", () => {
    assert.equal(isAnalyzableSourceFile("README.md"), false);
    assert.equal(isAnalyzableSourceFile("package.json"), false);
    assert.equal(isAnalyzableSourceFile("assets/logo.png"), false);
  });
});

describe("collectSourceFiles", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-collect-source-")
    );

    writeRepoFile(repoPath, "src/util.ts", "export const util = 1;\n");
    writeRepoFile(repoPath, "styles/base.css", ".btn { color: red; }\n");
    writeRepoFile(repoPath, "styles/theme.scss", "$color: blue;\n");
    writeRepoFile(repoPath, "styles/_tokens.sass", "$spacing: 8px\n");
    writeRepoFile(repoPath, "README.md", "# Demo\n");
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("walks and includes stylesheet files alongside JS/TS", () => {
    const files = collectSourceFiles(repoPath);

    assert.deepEqual(files, [
      "src/util.ts",
      "styles/_tokens.sass",
      "styles/base.css",
      "styles/theme.scss",
    ]);
  });
});

describe("createImportGraph stylesheet discovery", () => {
  let repoPath = "";

  before(() => {
    repoPath = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-import-graph-stylesheet-")
    );

    writeRepoFile(repoPath, "styles/base.css", ".btn { color: red; }\n");
    writeRepoFile(repoPath, "styles/theme.scss", "$color: blue;\n");
    writeRepoFile(repoPath, "styles/_tokens.sass", "$spacing: 8px\n");
  });

  after(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("scans repos containing only stylesheet files without error", () => {
    const graph = createImportGraph(repoPath);

    assert.equal(graph.size, 0);
  });
});

describe("createImportGraph CSS @import", () => {
  describe("quoted @import", () => {
    let repoPath = "";

    before(() => {
      repoPath = mkdtempSync(
        path.join(os.tmpdir(), "evidence-demo-import-graph-css-import-")
      );

      writeRepoFile(repoPath, "styles/base.css", ".btn { color: red; }\n");
      writeRepoFile(
        repoPath,
        "styles/app.css",
        "@import './base.css';\n\n.app { padding: 1rem; }\n"
      );
    });

    after(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it("creates reverse edge from base.css to app.css for @import './base.css'", () => {
      const graph = createImportGraph(repoPath);

      assert.deepEqual(graph.get("styles/base.css"), ["styles/app.css"]);
    });

    it("direct dependent count on changed base.css is 1", () => {
      const graph = createImportGraph(repoPath);

      const result = countDirectImportersForFile("styles/base.css", graph);

      assert.equal(result.dependentCount, 1);
      assert.deepEqual(result.dependents, ["styles/app.css"]);
    });
  });

  describe("@import url()", () => {
    let repoPath = "";

    before(() => {
      repoPath = mkdtempSync(
        path.join(os.tmpdir(), "evidence-demo-import-graph-css-import-url-")
      );

      writeRepoFile(repoPath, "styles/base.css", ".btn { color: red; }\n");
      writeRepoFile(
        repoPath,
        "styles/app.css",
        "@import url('./base.css');\n\n.app { padding: 1rem; }\n"
      );
    });

    after(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it("creates the same reverse edge for @import url('./base.css')", () => {
      const graph = createImportGraph(repoPath);

      assert.deepEqual(graph.get("styles/base.css"), ["styles/app.css"]);
    });
  });

  describe("extensionless resolution", () => {
    let repoPath = "";

    before(() => {
      repoPath = mkdtempSync(
        path.join(
          os.tmpdir(),
          "evidence-demo-import-graph-css-import-extensionless-"
        )
      );

      writeRepoFile(repoPath, "styles/theme.scss", "$color: blue;\n");
      writeRepoFile(
        repoPath,
        "styles/app.css",
        '@import "./theme";\n\n.app { color: black; }\n'
      );
    });

    after(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it("resolves extensionless specifiers to .css, .scss, and .sass targets", () => {
      const graph = createImportGraph(repoPath);

      assert.deepEqual(graph.get("styles/theme.scss"), ["styles/app.css"]);
    });
  });
});
