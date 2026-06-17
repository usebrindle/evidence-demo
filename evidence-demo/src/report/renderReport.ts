/**
 * Pure: renders a structured evidence report as human-readable text.
 */

import type { BlastRadiusFinding } from "../analyzers/blastRadius.js";
import type { FamiliarityFinding } from "../analyzers/familiarity.js";
import type { EvidenceReport } from "./buildEvidenceReport.js";

export interface RenderReportOptions {
  /** Reference date for relative recency phrases (defaults to now). */
  asOf?: Date;
}

function formatRelativeAge(date: Date, asOf: Date): string {
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.floor((asOf.getTime() - date.getTime()) / msPerDay);

  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "1 day ago";
  }
  if (days < 30) {
    return `${days} days ago`;
  }

  const months = Math.floor(days / 30);
  if (months === 1) {
    return "1 month ago";
  }
  if (months < 12) {
    return `${months} months ago`;
  }

  const years = Math.floor(months / 12);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

function formatShare(share: number): string {
  const percent = Math.round(share * 1000) / 10;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

function renderFamiliarityFinding(
  finding: FamiliarityFinding,
  asOf: Date
): string[] {
  const othersCommitCount = Math.max(
    0,
    finding.totalAreaCommitCount - finding.authorCommitCount
  );
  const authorCommitsPhrase =
    finding.authorCommitCount === 1
      ? "1 commit"
      : `${finding.authorCommitCount} commits`;
  const othersCommitsPhrase =
    othersCommitCount === 1
      ? "1 commit"
      : `${othersCommitCount} commits`;

  const lastTouchPhrase =
    finding.lastTouchDate === null
      ? "never touched in this window"
      : `last one ${formatRelativeAge(finding.lastTouchDate, asOf)}`;

  const sharePhrase =
    finding.authorCommitCount > 0
      ? ` (${formatShare(finding.shareOfAreaChurn)} of area churn)`
      : "";

  return [
    `  ${finding.area} — ${finding.characterization}`,
    `    Author has ${authorCommitsPhrase} here in 6 months${sharePhrase}, ${lastTouchPhrase}; ${othersCommitsPhrase} in this area total by others (${finding.totalAreaCommitCount} total in window).`,
  ];
}

function formatDependentSample(finding: BlastRadiusFinding): string {
  if (finding.dependentCount === 0) {
    return "Imported by no modules.";
  }

  const moduleWord = finding.dependentCount === 1 ? "module" : "modules";
  const remaining = finding.dependentCount - finding.dependents.length;

  if (finding.dependents.length === 0) {
    return `Imported by ${finding.dependentCount} ${moduleWord}.`;
  }

  const listed = finding.dependents.join(", ");
  if (remaining <= 0) {
    return `Imported by ${finding.dependentCount} ${moduleWord}, including ${listed}.`;
  }

  const moreWord = remaining === 1 ? "1 more" : `${remaining} more`;
  return `Imported by ${finding.dependentCount} ${moduleWord}, including ${listed} (and ${moreWord}).`;
}

function renderBlastRadiusFinding(finding: BlastRadiusFinding): string[] {
  return [
    `  ${finding.changedFile} — ${finding.characterization}`,
    `    ${formatDependentSample(finding)}`,
  ];
}

export function renderReport(
  report: EvidenceReport,
  options: RenderReportOptions = {}
): string {
  const asOf = options.asOf ?? new Date();
  const lines: string[] = [
    "Evidence Report",
    "===============",
    "",
    `Author: ${report.author.name} <${report.author.email}>`,
    `Changed files: ${report.changedFiles.length}`,
    "",
    "Familiarity",
    "-----------",
  ];

  if (report.familiarity.length === 0) {
    lines.push("  (no touched areas to analyze)");
  } else {
    for (const finding of report.familiarity) {
      lines.push(...renderFamiliarityFinding(finding, asOf));
    }
  }

  lines.push("", "Blast Radius", "------------");

  if (report.blastRadius.length === 0) {
    lines.push("  (no TypeScript changed files to analyze)");
  } else {
    for (const finding of report.blastRadius) {
      lines.push(...renderBlastRadiusFinding(finding));
    }
  }

  if (report.notAnalyzedForBlastRadius.length > 0) {
    lines.push("", "Not Analyzed for Blast Radius", "-----------------------------");
    lines.push(
      "  Blast-radius analysis covers TypeScript static imports only."
    );
    for (const file of report.notAnalyzedForBlastRadius) {
      lines.push(`  ${file}`);
    }
  }

  lines.push("", "Limitations", "-----------");
  for (const limitation of report.limitations) {
    lines.push(`  - ${limitation}`);
  }

  return lines.join("\n");
}
