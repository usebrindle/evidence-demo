import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BlastRadiusFinding } from "../src/analyzers/blastRadius.js";
import type { FamiliarityFinding } from "../src/analyzers/familiarity.js";
import { buildEvidenceReport } from "../src/report/buildEvidenceReport.js";
import {
  renderReport,
  shouldColorizeReport,
} from "../src/report/renderReport.js";

const author = { name: "Ada Lovelace", email: "ada@example.com" };
const asOf = new Date("2026-06-17T12:00:00Z");
const plainRenderOptions = { asOf, color: false as const };

const sampleFamiliarity: FamiliarityFinding[] = [
  {
    touchedFile: "src/util.ts",
    authorCommitCount: 2,
    totalFileCommitCount: 182,
    lastTouchDate: new Date("2026-02-17T12:00:00Z"),
    shareOfFileChurn: 2 / 182,
    characterization: "moderate",
  },
  {
    touchedFile: "docs/guide.md",
    authorCommitCount: 0,
    totalFileCommitCount: 4,
    lastTouchDate: null,
    shareOfFileChurn: 0,
    characterization: "none",
  },
];

const sampleBlastRadius: BlastRadiusFinding[] = [
  {
    changedFile: "src/util.ts",
    directDependentCount: 34,
    directDependents: [
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/d.ts",
      "src/e.ts",
    ],
    transitiveReachCount: 34,
    characterization: "broad",
  },
  {
    changedFile: "src/isolated.ts",
    directDependentCount: 0,
    directDependents: [],
    transitiveReachCount: 0,
    characterization: "isolated",
  },
];

describe("renderReport", () => {
  it("renders familiarity with supporting numbers, not just labels", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts", "docs/guide.md"],
      familiarity: sampleFamiliarity,
      blastRadius: [],
    });

    const text = renderReport(report, plainRenderOptions);

    assert.match(
      text,
      /Author has 2 commits to this file in 6 months \(1\.1% of file churn\), last touch 4 months ago; 180 commits by others in this window \(182 total\)\./
    );
    assert.match(
      text,
      /docs\/guide\.md — none[\s\S]*No author commits to this file in 6 months; 4 commits by others in this window\./
    );
  });

  it("renders blast radius with counts and sample dependents", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts", "src/isolated.ts"],
      familiarity: [],
      blastRadius: sampleBlastRadius,
    });

    const text = renderReport(report, plainRenderOptions);

    assert.match(
      text,
      /src\/util\.ts — broad[\s\S]*Depended on by 34 modules, including src\/a\.ts, src\/b\.ts, src\/c\.ts, src\/d\.ts, src\/e\.ts \(and 29 more\)\./
    );
    assert.match(
      text,
      /src\/isolated\.ts — isolated[\s\S]*Depended on by no modules\./
    );
  });

  it("includes an honest limitations section", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts"],
      familiarity: sampleFamiliarity.slice(0, 1),
      blastRadius: sampleBlastRadius.slice(0, 1),
    });

    const text = renderReport(report, plainRenderOptions);

    assert.match(text, /Limitations\n-----------/);
    for (const limitation of report.limitations) {
      assert.match(text, new RegExp(`- ${escapeRegExp(limitation)}`));
    }
    assert.doesNotMatch(text, /^Risk score:/im);
    assert.doesNotMatch(text, /^Recommendation:/im);
  });

  it("lists non-analyzable changed files with a JS/TS-only note", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts", "README.md", "package.json"],
      familiarity: sampleFamiliarity,
      blastRadius: sampleBlastRadius.slice(0, 1),
    });

    const text = renderReport(report, plainRenderOptions);

    assert.match(text, /Not Analyzed for Blast Radius/);
    assert.match(
      text,
      /Blast-radius analysis covers JavaScript\/TypeScript source files only\./
    );
    assert.match(text, /README\.md/);
    assert.match(text, /package\.json/);
    assert.match(text, /Familiarity[\s\S]*docs\/guide\.md — none/);
  });

  it("produces terminal-friendly output with section headers", () => {
    const report = buildEvidenceReport({
      author,
      changeReference: "42",
      changedFiles: ["src/util.ts"],
      familiarity: sampleFamiliarity.slice(0, 1),
      blastRadius: sampleBlastRadius.slice(0, 1),
    });

    const text = renderReport(report, plainRenderOptions);

    assert.match(text, /^Evidence Report\n={15}/);
    assert.match(text, /Author: Ada Lovelace <ada@example\.com>/);
    assert.match(text, /Change: 42/);
    assert.match(text, /Changed files \(1\):/);
    assert.match(text, /  src\/util\.ts/);
    assert.match(text, /Familiarity\n-{11}/);
    assert.match(
      text,
      /How much the author has worked on each changed file over the last 6 months\./
    );
    assert.match(text, /Blast Radius\n-{12}/);
    assert.match(
      text,
      /Direct static import and require\(\) dependents of each changed JavaScript or TypeScript source file\./
    );
    assert.ok(text.endsWith(report.limitations.at(-1)!));
  });

  it("labels repository-root files clearly", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["package.json"],
      familiarity: [
        {
          touchedFile: "package.json",
          authorCommitCount: 0,
          totalFileCommitCount: 39,
          lastTouchDate: null,
          shareOfFileChurn: 0,
          characterization: "none",
        },
      ],
      blastRadius: [],
    });

    const text = renderReport(report, plainRenderOptions);

    assert.match(
      text,
      /package\.json — none[\s\S]*No author commits to this file in 6 months; 39 commits by others in this window\./
    );
  });

  it("sorts unfamiliar areas before familiar ones and broad blast radius first", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts", "src/isolated.ts", "docs/guide.md"],
      familiarity: sampleFamiliarity,
      blastRadius: sampleBlastRadius,
    });

    const text = renderReport(report, plainRenderOptions);
    const familiaritySection = text.split("Blast Radius")[0] ?? "";
    const blastSection =
      text.split("Blast Radius")[1]?.split("Limitations")[0] ?? "";

    assert.ok(familiaritySection.indexOf("docs/guide.md — none") < familiaritySection.indexOf("src/util.ts — moderate"));
    assert.ok(blastSection.indexOf("src/util.ts — broad") < blastSection.indexOf("src/isolated.ts — isolated"));
  });

  it("contains no ANSI escape codes when color is false", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts"],
      familiarity: sampleFamiliarity.slice(0, 1),
      blastRadius: sampleBlastRadius.slice(0, 1),
    });

    const text = renderReport(report, plainRenderOptions);

    assert.doesNotMatch(text, /\u001b\[/);
  });

  it("emits ANSI escape codes when color is true", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts"],
      familiarity: sampleFamiliarity.slice(0, 1),
      blastRadius: sampleBlastRadius.slice(0, 1),
    });

    const text = renderReport(report, { asOf, color: true });

    assert.match(text, /\u001b\[/);
    assert.match(text, /Evidence Report/);
    assert.match(text, /\x1B\[1msrc\/util\.ts\x1B\[22m — \x1B\[31mbroad\x1B\[39m/);
  });
});

describe("shouldColorizeReport", () => {
  it("returns false when NO_COLOR is set", () => {
    const previous = process.env.NO_COLOR;
    process.env.NO_COLOR = "1";
    try {
      assert.equal(shouldColorizeReport({ isTTY: true }), false);
    } finally {
      if (previous === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = previous;
      }
    }
  });

  it("returns true when FORCE_COLOR is set on a non-TTY stream", () => {
    const previousNoColor = process.env.NO_COLOR;
    const previousForceColor = process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = "1";
    try {
      assert.equal(shouldColorizeReport({ isTTY: false }), true);
    } finally {
      if (previousNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = previousNoColor;
      }
      if (previousForceColor === undefined) {
        delete process.env.FORCE_COLOR;
      } else {
        process.env.FORCE_COLOR = previousForceColor;
      }
    }
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
