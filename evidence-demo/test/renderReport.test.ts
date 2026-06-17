import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BlastRadiusFinding } from "../src/analyzers/blastRadius.js";
import type { FamiliarityFinding } from "../src/analyzers/familiarity.js";
import { buildEvidenceReport } from "../src/report/buildEvidenceReport.js";
import { renderReport } from "../src/report/renderReport.js";

const author = { name: "Ada Lovelace", email: "ada@example.com" };
const asOf = new Date("2026-06-17T12:00:00Z");

const sampleFamiliarity: FamiliarityFinding[] = [
  {
    area: "src/",
    authorCommitCount: 2,
    totalAreaCommitCount: 182,
    lastTouchDate: new Date("2026-02-17T12:00:00Z"),
    shareOfAreaChurn: 2 / 182,
    characterization: "moderate",
  },
  {
    area: "docs/",
    authorCommitCount: 0,
    totalAreaCommitCount: 4,
    lastTouchDate: null,
    shareOfAreaChurn: 0,
    characterization: "none",
  },
];

const sampleBlastRadius: BlastRadiusFinding[] = [
  {
    changedFile: "src/util.ts",
    dependentCount: 34,
    dependents: [
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/d.ts",
      "src/e.ts",
    ],
    characterization: "broad",
  },
  {
    changedFile: "src/isolated.ts",
    dependentCount: 0,
    dependents: [],
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

    const text = renderReport(report, { asOf });

    assert.match(
      text,
      /Author has 2 commits here in 6 months \(1\.1% of area churn\), last touch 4 months ago; 180 commits by others in this window \(182 total\)\./
    );
    assert.match(
      text,
      /docs\/ — none[\s\S]*No author commits in this area in 6 months; 4 commits by others in this window\./
    );
  });

  it("renders blast radius with counts and sample dependents", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts", "src/isolated.ts"],
      familiarity: [],
      blastRadius: sampleBlastRadius,
    });

    const text = renderReport(report, { asOf });

    assert.match(
      text,
      /src\/util\.ts — broad[\s\S]*Imported by 34 modules, including src\/a\.ts, src\/b\.ts, src\/c\.ts, src\/d\.ts, src\/e\.ts \(and 29 more\)\./
    );
    assert.match(
      text,
      /src\/isolated\.ts — isolated[\s\S]*Imported by no modules\./
    );
  });

  it("includes an honest limitations section", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts"],
      familiarity: sampleFamiliarity.slice(0, 1),
      blastRadius: sampleBlastRadius.slice(0, 1),
    });

    const text = renderReport(report, { asOf });

    assert.match(text, /Limitations\n-----------/);
    for (const limitation of report.limitations) {
      assert.match(text, new RegExp(`- ${escapeRegExp(limitation)}`));
    }
    assert.doesNotMatch(text, /^Risk score:/im);
    assert.doesNotMatch(text, /^Recommendation:/im);
  });

  it("lists non-TypeScript changed files with a TS-only note", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts", "README.md", "package.json"],
      familiarity: sampleFamiliarity,
      blastRadius: sampleBlastRadius.slice(0, 1),
    });

    const text = renderReport(report, { asOf });

    assert.match(text, /Not Analyzed for Blast Radius/);
    assert.match(
      text,
      /Blast-radius analysis covers TypeScript static imports only\./
    );
    assert.match(text, /README\.md/);
    assert.match(text, /package\.json/);
    assert.match(text, /Familiarity[\s\S]*docs\/ — none/);
  });

  it("produces terminal-friendly output with section headers", () => {
    const report = buildEvidenceReport({
      author,
      changeReference: "42",
      changedFiles: ["src/util.ts"],
      familiarity: sampleFamiliarity.slice(0, 1),
      blastRadius: sampleBlastRadius.slice(0, 1),
    });

    const text = renderReport(report, { asOf });

    assert.match(text, /^Evidence Report\n={15}/);
    assert.match(text, /Author: Ada Lovelace <ada@example\.com>/);
    assert.match(text, /Change: 42/);
    assert.match(text, /Changed files \(1\):/);
    assert.match(text, /  src\/util\.ts/);
    assert.match(text, /Familiarity\n-{11}/);
    assert.match(text, /Blast Radius\n-{12}/);
    assert.ok(text.endsWith(report.limitations.at(-1)!));
  });

  it("labels repository-root areas clearly", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["package.json"],
      familiarity: [
        {
          area: ".",
          authorCommitCount: 0,
          totalAreaCommitCount: 39,
          lastTouchDate: null,
          shareOfAreaChurn: 0,
          characterization: "none",
        },
      ],
      blastRadius: [],
    });

    const text = renderReport(report, { asOf });

    assert.match(
      text,
      /\(repository root\) — none[\s\S]*No author commits in this area in 6 months; 39 commits by others in this window\./
    );
  });

  it("sorts unfamiliar areas before familiar ones and broad blast radius first", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts", "src/isolated.ts", "docs/guide.md"],
      familiarity: sampleFamiliarity,
      blastRadius: sampleBlastRadius,
    });

    const text = renderReport(report, { asOf });
    const familiaritySection = text.split("Blast Radius")[0] ?? "";
    const blastSection =
      text.split("Blast Radius")[1]?.split("Limitations")[0] ?? "";

    assert.ok(familiaritySection.indexOf("docs/ — none") < familiaritySection.indexOf("src/ — moderate"));
    assert.ok(blastSection.indexOf("src/util.ts — broad") < blastSection.indexOf("src/isolated.ts — isolated"));
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
