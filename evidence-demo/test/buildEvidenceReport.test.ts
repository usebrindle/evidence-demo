import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BlastRadiusFinding } from "../src/analyzers/blastRadius.js";
import type { FamiliarityFinding } from "../src/analyzers/familiarity.js";
import type { ChangedFileEntry } from "../src/inputs/changedFiles.js";
import {
  buildEvidenceReport,
  type EvidenceReport,
} from "../src/report/buildEvidenceReport.js";

const author = { name: "Ada Lovelace", email: "ada@example.com" };

function changedEntry(
  path: string,
  changeKind: ChangedFileEntry["changeKind"] = "modified"
): ChangedFileEntry {
  return { path, changeKind };
}

const sampleFamiliarity: FamiliarityFinding[] = [
  {
    touchedFile: "src/util.ts",
    changeKind: "modified",
    authorOwnedLineCount: 0,
    totalBlameableLineCount: 0,
    shareOfCurrentContent: 0,
    authorChangedLineCount: 0,
    totalChangedLineCount: 0,
    shareOfWindowedLineChurn: 0,
    authorCommitCount: 3,
    totalFileCommitCount: 12,
    lastTouchDate: new Date("2026-05-01T00:00:00Z"),
    shareOfFileCommitChurn: 0.25,
    characterization: "high",
  },
  {
    touchedFile: "docs/guide.md",
    changeKind: "modified",
    authorOwnedLineCount: 0,
    totalBlameableLineCount: 0,
    shareOfCurrentContent: 0,
    authorChangedLineCount: 0,
    totalChangedLineCount: 0,
    shareOfWindowedLineChurn: 0,
    authorCommitCount: 0,
    totalFileCommitCount: 4,
    lastTouchDate: null,
    shareOfFileCommitChurn: 0,
    characterization: "none",
  },
];

const sampleBlastRadius: BlastRadiusFinding[] = [
  {
    changedFile: "src/util.ts",
    directDependentCount: 4,
    directDependents: ["src/a.ts", "src/b.ts"],
    transitiveReachCount: 4,
    characterization: "moderate",
  },
];

function assertNoRiskScore(report: EvidenceReport): void {
  const keys = Object.keys(report as unknown as Record<string, unknown>);
  assert.ok(!keys.includes("riskScore"));
  assert.ok(!keys.includes("mergeRecommendation"));
  assert.ok(!keys.includes("recommendation"));
}

describe("buildEvidenceReport", () => {
  it("assembles analyzer findings into a structured report", () => {
    const changedFiles = [changedEntry("src/util.ts"), changedEntry("README.md")];

    const report = buildEvidenceReport({
      author,
      changedFiles,
      familiarity: sampleFamiliarity,
      blastRadius: sampleBlastRadius,
    });

    assert.deepEqual(report.author, author);
    assert.deepEqual(report.changedFiles, ["src/util.ts", "README.md"]);
    assert.deepEqual(report.familiarity, sampleFamiliarity);
    assert.deepEqual(report.blastRadius, sampleBlastRadius);
    assertNoRiskScore(report);
  });

  it("retains supporting numbers on familiarity findings, not just labels", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: [changedEntry("src/util.ts")],
      familiarity: sampleFamiliarity,
      blastRadius: [],
    });

    const srcFinding = report.familiarity.find((f) => f.touchedFile === "src/util.ts");
    assert.ok(srcFinding);
    assert.equal(srcFinding.authorCommitCount, 3);
    assert.equal(srcFinding.totalFileCommitCount, 12);
    assert.equal(srcFinding.shareOfFileCommitChurn, 0.25);
    assert.equal(srcFinding.characterization, "high");
    assert.equal(
      srcFinding.lastTouchDate?.toISOString(),
      "2026-05-01T00:00:00.000Z"
    );
  });

  it("retains direct dependent count and named direct dependents on blast-radius findings", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: [changedEntry("src/util.ts")],
      familiarity: [],
      blastRadius: sampleBlastRadius,
    });

    assert.equal(report.blastRadius.length, 1);
    const finding = report.blastRadius[0];
    assert.equal(finding.directDependentCount, 4);
    assert.equal(finding.transitiveReachCount, 4);
    assert.deepEqual(finding.directDependents, ["src/a.ts", "src/b.ts"]);
    assert.equal(finding.characterization, "moderate");
  });

  it("lists non-analyzable changed files under not analyzed for blast radius", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: [
        changedEntry("src/util.ts"),
        changedEntry("README.md"),
        changedEntry("package.json"),
      ],
      familiarity: sampleFamiliarity,
      blastRadius: sampleBlastRadius,
    });

    assert.deepEqual(report.notAnalyzedForBlastRadius, [
      "README.md",
      "package.json",
    ]);
  });

  it("does not list analyzable JS/TS files in not analyzed when they have blast-radius findings", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: [changedEntry("src/util.ts"), changedEntry("src/other.ts")],
      familiarity: [],
      blastRadius: sampleBlastRadius,
    });

    assert.deepEqual(report.notAnalyzedForBlastRadius, []);
  });

  it("does not list changed JavaScript files in not analyzed when they have blast-radius findings", () => {
    const jsBlastRadius: BlastRadiusFinding[] = [
      {
        changedFile: "src/util.js",
        directDependentCount: 2,
        directDependents: ["src/a.js", "src/b.jsx"],
        transitiveReachCount: 2,
        characterization: "isolated",
      },
    ];

    const report = buildEvidenceReport({
      author,
      changedFiles: [changedEntry("src/util.js"), changedEntry("README.md")],
      familiarity: [],
      blastRadius: jsBlastRadius,
    });

    assert.deepEqual(report.notAnalyzedForBlastRadius, ["README.md"]);
    assert.ok(
      report.limitations.some((item) =>
        item.includes("static ESM import and static-literal CommonJS require()")
      )
    );
    assert.ok(
      report.limitations.some((item) => item.includes("dynamic require()"))
    );
  });

  it("states explicit limitations and omits a risk score or merge recommendation", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: [changedEntry("src/util.ts")],
      familiarity: sampleFamiliarity,
      blastRadius: sampleBlastRadius,
    });

    assert.ok(report.limitations.length >= 3);
    assert.ok(
      report.limitations.some(
        (item) =>
          item.includes("Transitive reach") &&
          item.includes("static ESM import and static-literal CommonJS require()")
      )
    );
    assert.ok(
      report.limitations.every(
        (item) => !item.includes("transitive dependency impact is not computed")
      )
    );
    assert.ok(
      report.limitations.some((item) =>
        item.toLowerCase().includes("no risk score")
      )
    );
    assert.ok(
      report.limitations.some((item) =>
        item.includes(
          "Path aliases are resolved only from the repository root tsconfig.json or jsconfig.json"
        )
      )
    );
    assert.ok(
      report.limitations.some((item) =>
        item.includes("bundler config") && item.includes("nested package configs")
      )
    );
    assertNoRiskScore(report);
  });

  it("states blame-based familiarity limitations and merged git-history caveats", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: [changedEntry("src/util.ts")],
      familiarity: sampleFamiliarity,
      blastRadius: sampleBlastRadius,
    });

    assert.ok(
      report.limitations.some(
        (item) =>
          item.includes("git blame at merge-base") &&
          item.includes("content ownership") &&
          item.includes("windowed line churn") &&
          item.includes("git log up to merge-base only") &&
          item.includes("PR commits and line changes") &&
          item.includes("excluded") &&
          item.includes("Commit-share is reported separately") &&
          item.includes("not a substitute for line ownership")
      )
    );
    assert.ok(
      report.limitations.every((item) => !item.includes("git blame at PR head"))
    );
    assert.ok(
      report.limitations.some(
        (item) =>
          item.includes("Git history and blame do not account for") &&
          item.includes("renames, squashes, co-authored commits, or bot attribution") &&
          item.includes("generated, minified, or binary files")
      )
    );
    assert.ok(
      report.limitations.some(
        (item) =>
          item.includes("Familiarity window is fixed at 6 months") &&
          item.includes("recency gates the characterization label") &&
          item.includes("high current-line ownership without a recent touch")
      )
    );
    assert.ok(
      report.limitations.every(
        (item) =>
          !item.includes("Git history does not account for") ||
          item.includes("Git history and blame do not account for")
      )
    );
  });

  it("derives display paths from changed file entries regardless of change kind", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: [
        changedEntry("src/new.ts", "added"),
        changedEntry("src/existing.ts", "modified"),
      ],
      familiarity: [],
      blastRadius: [],
    });

    assert.deepEqual(report.changedFiles, ["src/new.ts", "src/existing.ts"]);
  });

  it("passes through changeReference when provided", () => {
    const report = buildEvidenceReport({
      author,
      changeReference: "6098",
      changedFiles: [changedEntry("src/util.ts")],
      familiarity: [],
      blastRadius: [],
    });

    assert.equal(report.changeReference, "6098");
  });
});
