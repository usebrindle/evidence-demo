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
    assert.match(output, /src\/auth\.ts — high/);
    assert.match(
      output,
      /File added in this PR; no prior history on this path\. Author is the sole contributor in this change\./
    );
    assert.match(output, /Blast Radius/);
    assert.match(output, /src\/auth\.ts — isolated/);
    assert.match(output, /Depended on by 2 files, including src\/login\.ts, src\/signup\.ts/);
    assert.match(output, /Limitations/);
    assert.doesNotMatch(output, /no analyzable JS\/TS or stylesheet changed files to analyze/);
  });

  it("prints a complete report for a branch name", () => {
    const output = runEvidenceDemo(repoPath, "feature/auth", {
      asOf: REFERENCE_DATE,
    });

    assert.match(output, /Author: Alice Author <alice@example.com>/);
    assert.match(output, /src\/auth\.ts —/);
    assert.match(output, /Changed files \(3\):/);
    assert.match(output, /src\/auth\.ts — isolated/);
    assert.match(output, /Depended on by 2 files/);
  });

  it("lists non-analyzable changed files under not-analyzed for blast radius", () => {
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
    assert.match(
      output,
      /Blast-radius analysis covers JavaScript, TypeScript, CSS, SCSS, and Sass source files only/
    );
    assert.match(output, /src\/auth\.ts — isolated/);
  });

  it("produces a complete end-to-end report when the changed file is JavaScript", () => {
    const jsRepo = mkdtempSync(path.join(os.tmpdir(), "evidence-demo-js-e2e-"));
    try {
      git(jsRepo, ["init"]);
      git(jsRepo, ["config", "user.name", "Setup"]);
      git(jsRepo, ["config", "user.email", "setup@example.com"]);

      writeRepoFile(jsRepo, "src/core.js", "export const core = 1;\n");
      writeRepoFile(
        jsRepo,
        "src/a.js",
        "import { core } from './core.js';\nexport const a = core;\n"
      );
      writeRepoFile(
        jsRepo,
        "src/b.jsx",
        "import { core } from './core.js';\nexport const b = core;\n"
      );
      writeRepoFile(
        jsRepo,
        "src/c.js",
        "import { core } from './core.js';\nexport const c = core;\n"
      );
      commitAs(
        jsRepo,
        { name: "Carol Core", email: "carol@example.com" },
        daysAgo(90),
        "init core"
      );
      const base = git(jsRepo, ["rev-parse", "HEAD"]);

      writeRepoFile(jsRepo, "src/core.js", "export const core = 2;\n");
      commitAs(
        jsRepo,
        { name: "Dev User", email: "dev@example.com" },
        daysAgo(15),
        "dev updates core"
      );
      const head = git(jsRepo, ["rev-parse", "HEAD"]);

      const output = runEvidenceDemo(jsRepo, `${base}...${head}`, {
        asOf: REFERENCE_DATE,
      });

      assert.match(output, /Author: Dev User <dev@example.com>/);
      assert.match(output, /Familiarity/);
      assert.match(output, /src\/core\.js —/);
      assert.match(output, /Blast Radius/);
      assert.match(output, /src\/core\.js — moderate/);
      assert.match(output, /Depended on by 3 files/);
      assert.match(output, /Limitations/);
      assert.doesNotMatch(output, /Not Analyzed for Blast Radius/);
    } finally {
      rmSync(jsRepo, { recursive: true, force: true });
    }
  });

  it("shows separate familiarity lines per changed file in the same directory", () => {
    const famRepo = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-familiarity-e2e-")
    );
    try {
      git(famRepo, ["init"]);
      git(famRepo, ["config", "user.name", "Setup"]);
      git(famRepo, ["config", "user.email", "setup@example.com"]);

      writeRepoFile(famRepo, "src/foo.ts", "export const foo = 1;\n");
      writeRepoFile(famRepo, "src/bar.ts", "export const bar = 1;\n");
      commitAs(
        famRepo,
        { name: "Bob Builder", email: "bob@example.com" },
        daysAgo(120),
        "bob init both files"
      );

      writeRepoFile(famRepo, "src/foo.ts", "export const foo = 2;\n");
      commitAs(
        famRepo,
        { name: "Alice Author", email: "alice@example.com" },
        daysAgo(80),
        "alice first foo"
      );

      writeRepoFile(famRepo, "src/foo.ts", "export const foo = 3;\n");
      commitAs(
        famRepo,
        { name: "Alice Author", email: "alice@example.com" },
        daysAgo(50),
        "alice second foo"
      );

      writeRepoFile(famRepo, "src/bar.ts", "export const bar = 2;\n");
      commitAs(
        famRepo,
        { name: "Bob Builder", email: "bob@example.com" },
        daysAgo(40),
        "bob updates bar"
      );

      writeRepoFile(famRepo, "src/bar.ts", "export const bar = 3;\n");
      commitAs(
        famRepo,
        { name: "Bob Builder", email: "bob@example.com" },
        daysAgo(35),
        "bob updates bar again"
      );

      writeRepoFile(famRepo, "src/bar.ts", "export const bar = 4;\n");
      commitAs(
        famRepo,
        { name: "Bob Builder", email: "bob@example.com" },
        daysAgo(30),
        "bob updates bar third time"
      );

      writeRepoFile(famRepo, "src/foo.ts", "export const foo = 4;\n");
      commitAs(
        famRepo,
        { name: "Alice Author", email: "alice@example.com" },
        daysAgo(20),
        "alice third foo"
      );
      const base = git(famRepo, ["rev-parse", "HEAD"]);

      writeRepoFile(famRepo, "src/foo.ts", "export const foo = 5;\n");
      writeRepoFile(famRepo, "src/bar.ts", "export const bar = 3;\n");
      commitAs(
        famRepo,
        { name: "Alice Author", email: "alice@example.com" },
        daysAgo(5),
        "alice changes foo and bar"
      );
      const head = git(famRepo, ["rev-parse", "HEAD"]);

      const output = runEvidenceDemo(famRepo, `${base}...${head}`, {
        asOf: REFERENCE_DATE,
      });

      assert.match(output, /Author: Alice Author <alice@example.com>/);
      assert.match(output, /Changed files \(2\):/);
      assert.match(output, /Familiarity/);
      assert.match(output, /src\/foo\.ts — high/);
      assert.match(output, /Author owned .* of lines/);
      assert.match(output, /3 commits, last touch 20 days ago/);
      assert.match(output, /src\/bar\.ts — none/);
      assert.doesNotMatch(output, /src\/ —/);
    } finally {
      rmSync(famRepo, { recursive: true, force: true });
    }
  });

  it("shows blast-radius dependents when modules use require() only", () => {
    const requireRepo = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-require-e2e-")
    );
    try {
      git(requireRepo, ["init"]);
      git(requireRepo, ["config", "user.name", "Setup"]);
      git(requireRepo, ["config", "user.email", "setup@example.com"]);

      writeRepoFile(
        requireRepo,
        "src/core.js",
        "module.exports = { core: 1 };\n"
      );
      writeRepoFile(
        requireRepo,
        "src/a.js",
        "const { core } = require('./core');\nmodule.exports = { a: core };\n"
      );
      writeRepoFile(
        requireRepo,
        "src/b.js",
        "const { core } = require('./core');\nmodule.exports = { b: core };\n"
      );
      commitAs(
        requireRepo,
        { name: "Carol Core", email: "carol@example.com" },
        daysAgo(90),
        "init core"
      );
      const base = git(requireRepo, ["rev-parse", "HEAD"]);

      writeRepoFile(requireRepo, "src/core.js", "module.exports = { core: 2 };\n");
      commitAs(
        requireRepo,
        { name: "Dev User", email: "dev@example.com" },
        daysAgo(15),
        "dev updates core"
      );
      const head = git(requireRepo, ["rev-parse", "HEAD"]);

      const output = runEvidenceDemo(requireRepo, `${base}...${head}`, {
        asOf: REFERENCE_DATE,
      });

      assert.match(output, /Blast Radius/);
      assert.match(output, /src\/core\.js — isolated/);
      assert.match(
        output,
        /Depended on by 2 files, including src\/a\.js, src\/b\.js/
      );
      assert.doesNotMatch(output, /Not Analyzed for Blast Radius/);
    } finally {
      rmSync(requireRepo, { recursive: true, force: true });
    }
  });

  it("surfaces transitive reach on a deep dependency chain with divergent copy", () => {
    const chainRepo = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-transitive-chain-e2e-")
    );
    try {
      git(chainRepo, ["init"]);
      git(chainRepo, ["config", "user.name", "Setup"]);
      git(chainRepo, ["config", "user.email", "setup@example.com"]);

      writeRepoFile(chainRepo, "src/input.ts", "export const input = 1;\n");
      writeRepoFile(
        chainRepo,
        "src/form.ts",
        "import { input } from './input';\nexport const form = input;\n"
      );
      writeRepoFile(
        chainRepo,
        "src/header.ts",
        "import { form } from './form';\nexport const header = form;\n"
      );
      const pageCount = 10;
      for (let index = 0; index < pageCount; index += 1) {
        writeRepoFile(
          chainRepo,
          `src/pages/page${index}.tsx`,
          "import { header } from '../header';\nexport const page = header;\n"
        );
      }
      commitAs(
        chainRepo,
        { name: "Carol Core", email: "carol@example.com" },
        daysAgo(90),
        "init deep chain"
      );
      const base = git(chainRepo, ["rev-parse", "HEAD"]);

      writeRepoFile(chainRepo, "src/input.ts", "export const input = 2;\n");
      commitAs(
        chainRepo,
        { name: "Dev User", email: "dev@example.com" },
        daysAgo(15),
        "dev updates input leaf"
      );
      const head = git(chainRepo, ["rev-parse", "HEAD"]);

      const output = runEvidenceDemo(chainRepo, `${base}...${head}`, {
        asOf: REFERENCE_DATE,
      });

      assert.match(output, /Author: Dev User <dev@example.com>/);
      assert.match(output, /Blast Radius/);
      assert.match(output, /src\/input\.ts — broad/);
      assert.match(
        output,
        /Reach: 12 files transitively \(1 direct importer\), including src\/form\.ts\./
      );
      assert.doesNotMatch(output, /Not Analyzed for Blast Radius/);
    } finally {
      rmSync(chainRepo, { recursive: true, force: true });
    }
  });

  it("shows high familiarity with greenfield copy when the PR adds a new file", () => {
    const greenfieldRepo = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-greenfield-e2e-")
    );
    try {
      git(greenfieldRepo, ["init"]);
      git(greenfieldRepo, ["config", "user.name", "Setup"]);
      git(greenfieldRepo, ["config", "user.email", "setup@example.com"]);

      writeRepoFile(
        greenfieldRepo,
        "src/existing.ts",
        "export const existing = 1;\n"
      );
      commitAs(
        greenfieldRepo,
        { name: "Bob Builder", email: "bob@example.com" },
        daysAgo(150),
        "bob creates existing file"
      );
      const base = git(greenfieldRepo, ["rev-parse", "HEAD"]);

      writeRepoFile(
        greenfieldRepo,
        "src/newModule.ts",
        "export const created = true;\n"
      );
      commitAs(
        greenfieldRepo,
        { name: "Alice Author", email: "alice@example.com" },
        daysAgo(5),
        "alice adds new module"
      );
      const head = git(greenfieldRepo, ["rev-parse", "HEAD"]);

      const output = runEvidenceDemo(greenfieldRepo, `${base}...${head}`, {
        asOf: REFERENCE_DATE,
      });

      assert.match(output, /Author: Alice Author <alice@example.com>/);
      assert.match(output, /Familiarity/);
      assert.match(output, /src\/newModule\.ts — high/);
      assert.match(
        output,
        /File added in this PR; no prior history on this path\. Author is the sole contributor in this change\./
      );
      assert.doesNotMatch(output, /src\/newModule\.ts — none/);
      assert.doesNotMatch(output, /Author owned 0% of lines before this PR/);
    } finally {
      rmSync(greenfieldRepo, { recursive: true, force: true });
    }
  });

  it("shows none for first-touch modified file with pre-PR no-author-history copy (not greenfield high)", () => {
    const firstTouchRepo = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-first-touch-e2e-")
    );
    try {
      git(firstTouchRepo, ["init"]);
      git(firstTouchRepo, ["config", "user.name", "Setup"]);
      git(firstTouchRepo, ["config", "user.email", "setup@example.com"]);

      writeRepoFile(
        firstTouchRepo,
        "src/existing.ts",
        "export const existing = 1;\n"
      );
      commitAs(
        firstTouchRepo,
        { name: "Bob Builder", email: "bob@example.com" },
        daysAgo(150),
        "bob creates existing file"
      );

      for (let index = 0; index < 3; index += 1) {
        writeRepoFile(
          firstTouchRepo,
          "src/existing.ts",
          `export const existing = ${index + 2};\n`
        );
        commitAs(
          firstTouchRepo,
          { name: "Bob Builder", email: "bob@example.com" },
          daysAgo(120 - index * 20),
          `bob updates existing ${index}`
        );
      }
      const base = git(firstTouchRepo, ["rev-parse", "HEAD"]);

      writeRepoFile(
        firstTouchRepo,
        "src/existing.ts",
        "export const existing = 99;\n"
      );
      commitAs(
        firstTouchRepo,
        { name: "Alice Author", email: "alice@example.com" },
        daysAgo(5),
        "alice first touch on existing file"
      );
      const head = git(firstTouchRepo, ["rev-parse", "HEAD"]);

      const output = runEvidenceDemo(firstTouchRepo, `${base}...${head}`, {
        asOf: REFERENCE_DATE,
      });

      assert.match(output, /Author: Alice Author <alice@example.com>/);
      assert.match(output, /Familiarity/);
      assert.match(output, /src\/existing\.ts — none/);
      assert.doesNotMatch(output, /src\/existing\.ts — high/);
      assert.doesNotMatch(output, /src\/existing\.ts — moderate/);
      assert.match(
        output,
        /src\/existing\.ts — none[\s\S]*before this PR[\s\S]*no author commits in window/
      );
      assert.doesNotMatch(
        output,
        /File added in this PR; no prior history on this path\. Author is the sole contributor in this change\./
      );
    } finally {
      rmSync(firstTouchRepo, { recursive: true, force: true });
    }
  });

  it("shows high familiarity for pre-PR single-rewrite regression", () => {
    const rewriteRepo = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-single-rewrite-e2e-")
    );
    try {
      git(rewriteRepo, ["init"]);
      git(rewriteRepo, ["config", "user.name", "Setup"]);
      git(rewriteRepo, ["config", "user.email", "setup@example.com"]);

      writeRepoFile(
        rewriteRepo,
        "src/rewrite.ts",
        [
          "// bob line 1",
          "export const a = 1;",
          "// bob line 2",
          "export const b = 2;",
          "// bob line 3",
          "export const c = 3;",
        ].join("\n")
      );
      commitAs(
        rewriteRepo,
        { name: "Bob Builder", email: "bob@example.com" },
        daysAgo(150),
        "bob initial rewrite file"
      );

      for (let index = 0; index < 5; index += 1) {
        writeRepoFile(
          rewriteRepo,
          "src/rewrite.ts",
          `// bob tweak ${index}\nexport const v = ${index};\n`
        );
        commitAs(
          rewriteRepo,
          { name: "Bob Builder", email: "bob@example.com" },
          daysAgo(140 - index * 10),
          `bob small edit ${index}`
        );
      }

      writeRepoFile(
        rewriteRepo,
        "src/rewrite.ts",
        [
          "// alice rewrite 1",
          "export const x = 1;",
          "// alice rewrite 2",
          "export const y = 2;",
          "// alice rewrite 3",
          "export const z = 3;",
          "// alice rewrite 4",
          "export const w = 4;",
        ].join("\n")
      );
      commitAs(
        rewriteRepo,
        { name: "Alice Author", email: "alice@example.com" },
        daysAgo(10),
        "alice rewrites most lines"
      );
      const base = git(rewriteRepo, ["rev-parse", "HEAD"]);

      writeRepoFile(rewriteRepo, "src/rewrite.ts", "// alice follow-up\nexport const x = 2;\n");
      commitAs(
        rewriteRepo,
        { name: "Alice Author", email: "alice@example.com" },
        daysAgo(5),
        "alice small follow-up edit"
      );
      const head = git(rewriteRepo, ["rev-parse", "HEAD"]);

      const output = runEvidenceDemo(rewriteRepo, `${base}...${head}`, {
        asOf: REFERENCE_DATE,
      });

      assert.match(output, /Author: Alice Author <alice@example.com>/);
      assert.match(output, /Familiarity/);
      assert.match(output, /src\/rewrite\.ts — high/);
      assert.match(output, /Author owned 100% of lines/);
      assert.match(output, /before this PR/);
      assert.match(output, /1 commit, last touch 10 days ago/);
      assert.match(output, /6 commits by others in window/);
    } finally {
      rmSync(rewriteRepo, { recursive: true, force: true });
    }
  });

  it("produces a complete end-to-end report when the changed file is a stylesheet", () => {
    const stylesheetRepo = mkdtempSync(
      path.join(os.tmpdir(), "evidence-demo-stylesheet-e2e-")
    );
    try {
      git(stylesheetRepo, ["init"]);
      git(stylesheetRepo, ["config", "user.name", "Setup"]);
      git(stylesheetRepo, ["config", "user.email", "setup@example.com"]);

      writeRepoFile(
        stylesheetRepo,
        "styles/_tokens.scss",
        "$spacing: 8px;\n"
      );
      writeRepoFile(
        stylesheetRepo,
        "styles/theme.scss",
        "@use 'tokens';\n\n.theme { padding: tokens.$spacing; }\n"
      );
      writeRepoFile(
        stylesheetRepo,
        "styles/main.scss",
        "@forward './theme';\n\n.main { display: block; }\n"
      );
      writeRepoFile(
        stylesheetRepo,
        "src/App.tsx",
        "import '../styles/main.scss';\nexport const App = () => null;\n"
      );
      commitAs(
        stylesheetRepo,
        { name: "Carol Core", email: "carol@example.com" },
        daysAgo(90),
        "init stylesheet chain"
      );
      const base = git(stylesheetRepo, ["rev-parse", "HEAD"]);

      writeRepoFile(
        stylesheetRepo,
        "styles/_tokens.scss",
        "$spacing: 16px;\n"
      );
      commitAs(
        stylesheetRepo,
        { name: "Dev User", email: "dev@example.com" },
        daysAgo(15),
        "dev updates tokens"
      );
      const head = git(stylesheetRepo, ["rev-parse", "HEAD"]);

      const output = runEvidenceDemo(stylesheetRepo, `${base}...${head}`, {
        asOf: REFERENCE_DATE,
      });

      assert.match(output, /Author: Dev User <dev@example.com>/);
      assert.match(output, /Familiarity/);
      assert.match(output, /styles\/_tokens\.scss —/);
      assert.match(output, /Blast Radius/);
      assert.match(output, /styles\/_tokens\.scss — moderate/);
      assert.match(
        output,
        /Reach: 3 files transitively \(1 direct importer\), including styles\/theme\.scss\./
      );
      assert.match(output, /Limitations/);
      assert.match(
        output,
        /Stylesheet reach follows static @import, @use, and @forward/
      );
      assert.doesNotMatch(output, /Not Analyzed for Blast Radius/);
      assert.doesNotMatch(
        output,
        /styles\/_tokens\.scss[\s\S]*Not Analyzed for Blast Radius/
      );
    } finally {
      rmSync(stylesheetRepo, { recursive: true, force: true });
    }
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
      assert.match(output, /src\/core\.ts —/);
      assert.match(output, /Blast Radius/);
      assert.match(output, /src\/core\.ts — moderate/);
      assert.match(output, /Depended on by 3 files/);
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
