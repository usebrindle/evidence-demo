import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BlastRadiusFinding } from "../src/analyzers/blastRadius.js";
import type { FamiliarityFinding } from "../src/analyzers/familiarity.js";
import {
  buildEvidenceReport,
  type EvidenceReport,
} from "../src/report/buildEvidenceReport.js";

const author = { name: "Ada Lovelace", email: "ada@example.com" };

const sampleFamiliarity: FamiliarityFinding[] = [
  {
    area: "src/",
    authorCommitCount: 3,
    totalAreaCommitCount: 12,
    lastTouchDate: new Date("2026-05-01T00:00:00Z"),
    shareOfAreaChurn: 0.25,
    characterization: "high",
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
    dependentCount: 4,
    dependents: ["src/a.ts", "src/b.ts"],
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
    const changedFiles = ["src/util.ts", "README.md"];

    const report = buildEvidenceReport({
      author,
      changedFiles,
      familiarity: sampleFamiliarity,
      blastRadius: sampleBlastRadius,
    });

    assert.deepEqual(report.author, author);
    assert.deepEqual(report.changedFiles, changedFiles);
    assert.deepEqual(report.familiarity, sampleFamiliarity);
    assert.deepEqual(report.blastRadius, sampleBlastRadius);
    assertNoRiskScore(report);
  });

  it("retains supporting numbers on familiarity findings, not just labels", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts"],
      familiarity: sampleFamiliarity,
      blastRadius: [],
    });

    const srcFinding = report.familiarity.find((f) => f.area === "src/");
    assert.ok(srcFinding);
    assert.equal(srcFinding.authorCommitCount, 3);
    assert.equal(srcFinding.totalAreaCommitCount, 12);
    assert.equal(srcFinding.shareOfAreaChurn, 0.25);
    assert.equal(srcFinding.characterization, "high");
    assert.equal(
      srcFinding.lastTouchDate?.toISOString(),
      "2026-05-01T00:00:00.000Z"
    );
  });

  it("retains dependent count and named dependents on blast-radius findings", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts"],
      familiarity: [],
      blastRadius: sampleBlastRadius,
    });

    assert.equal(report.blastRadius.length, 1);
    const finding = report.blastRadius[0];
    assert.equal(finding.dependentCount, 4);
    assert.deepEqual(finding.dependents, ["src/a.ts", "src/b.ts"]);
    assert.equal(finding.characterization, "moderate");
  });

  it("lists non-analyzable changed files under not analyzed for blast radius", () => {
    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.ts", "README.md", "package.json"],
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
      changedFiles: ["src/util.ts", "src/other.ts"],
      familiarity: [],
      blastRadius: sampleBlastRadius,
    });

    assert.deepEqual(report.notAnalyzedForBlastRadius, []);
  });

  it("does not list changed JavaScript files in not analyzed when they have blast-radius findings", () => {
    const jsBlastRadius: BlastRadiusFinding[] = [
      {
        changedFile: "src/util.js",
        dependentCount: 2,
        dependents: ["src/a.js", "src/b.jsx"],
        characterization: "isolated",
      },
    ];

    const report = buildEvidenceReport({
      author,
      changedFiles: ["src/util.js", "README.md"],
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
      changedFiles: ["src/util.ts"],
      familiarity: sampleFamiliarity,
      blastRadius: sampleBlastRadius,
    });

    assert.ok(report.limitations.length >= 3);
    assert.ok(
      report.limitations.some((item) => item.includes("transitive dependency"))
    );
    assert.ok(
      report.limitations.some((item) =>
        item.toLowerCase().includes("no risk score")
      )
    );
    assertNoRiskScore(report);
  });

  it("passes through changeReference when provided", () => {
    const report = buildEvidenceReport({
      author,
      changeReference: "6098",
      changedFiles: ["src/util.ts"],
      familiarity: [],
      blastRadius: [],
    });

    assert.equal(report.changeReference, "6098");
  });
});
