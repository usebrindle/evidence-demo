/**
 * Pure: renders a structured evidence report as human-readable text.
 */

import type { BlastRadiusFinding } from "../analyzers/blastRadius.js";
import type { FamiliarityFinding } from "../analyzers/familiarity.js";
import type { EvidenceReport } from "./buildEvidenceReport.js";

export interface RenderReportOptions {
  /** Reference date for relative recency phrases (defaults to now). */
  asOf?: Date;
  /** Max changed files to list before truncating (defaults to 12). */
  maxChangedFilesListed?: number;
}

const FAMILIARITY_ORDER: Record<FamiliarityFinding["characterization"], number> =
  {
    none: 0,
    moderate: 1,
    high: 2,
  };

const BLAST_RADIUS_ORDER: Record<
  BlastRadiusFinding["characterization"],
  number
> = {
  broad: 0,
  moderate: 1,
  isolated: 2,
};

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

function formatAreaLabel(area: string): string {
  return area === "." ? "(repository root)" : area;
}

function formatFamiliarityDetail(
  finding: FamiliarityFinding,
  asOf: Date
): string {
  const othersCommitCount = Math.max(
    0,
    finding.totalFileCommitCount - finding.authorCommitCount
  );
  const lastTouchPhrase =
    finding.lastTouchDate === null
      ? "never touched in this window"
      : `last touch ${formatRelativeAge(finding.lastTouchDate, asOf)}`;

  if (finding.authorCommitCount === 0) {
    const othersPhrase =
      othersCommitCount === 1
        ? "1 commit by others"
        : `${othersCommitCount} commits by others`;
    return `No author commits in this area in 6 months; ${othersPhrase} in this window.`;
  }

  const authorCommitsPhrase =
    finding.authorCommitCount === 1
      ? "1 commit"
      : `${finding.authorCommitCount} commits`;

  if (othersCommitCount === 0) {
    return `Author has ${authorCommitsPhrase} here in 6 months (sole contributor in window), ${lastTouchPhrase}.`;
  }

  const sharePhrase = ` (${formatShare(finding.shareOfFileChurn)} of area churn)`;
  const othersPhrase =
    othersCommitCount === 1
      ? "1 commit by others"
      : `${othersCommitCount} commits by others`;

  return `Author has ${authorCommitsPhrase} here in 6 months${sharePhrase}, ${lastTouchPhrase}; ${othersPhrase} in this window (${finding.totalFileCommitCount} total).`;
}

function renderFamiliarityFinding(
  finding: FamiliarityFinding,
  asOf: Date
): string[] {
  return [
    `  ${formatAreaLabel(finding.touchedFile)} — ${finding.characterization}`,
    `    ${formatFamiliarityDetail(finding, asOf)}`,
  ];
}

function formatDependentSample(finding: BlastRadiusFinding): string {
  if (finding.dependentCount === 0) {
    return "Depended on by no modules.";
  }

  const moduleWord = finding.dependentCount === 1 ? "module" : "modules";
  const remaining = finding.dependentCount - finding.dependents.length;

  if (finding.dependents.length === 0) {
    return `Depended on by ${finding.dependentCount} ${moduleWord}.`;
  }

  const listed = finding.dependents.join(", ");
  if (remaining <= 0) {
    return `Depended on by ${finding.dependentCount} ${moduleWord}, including ${listed}.`;
  }

  const moreWord = remaining === 1 ? "1 more" : `${remaining} more`;
  return `Depended on by ${finding.dependentCount} ${moduleWord}, including ${listed} (and ${moreWord}).`;
}

function renderBlastRadiusFinding(finding: BlastRadiusFinding): string[] {
  return [
    `  ${finding.changedFile} — ${finding.characterization}`,
    `    ${formatDependentSample(finding)}`,
  ];
}

function renderChangedFilesList(
  changedFiles: readonly string[],
  maxListed: number
): string[] {
  if (changedFiles.length === 0) {
    return ["  (none)"];
  }

  const lines = changedFiles.slice(0, maxListed).map((file) => `  ${file}`);
  const remaining = changedFiles.length - maxListed;
  if (remaining > 0) {
    const fileWord = remaining === 1 ? "file" : "files";
    lines.push(`  ... and ${remaining} more ${fileWord}`);
  }
  return lines;
}

export function renderReport(
  report: EvidenceReport,
  options: RenderReportOptions = {}
): string {
  const asOf = options.asOf ?? new Date();
  const maxChangedFilesListed = options.maxChangedFilesListed ?? 12;

  const familiarity = [...report.familiarity].sort(
    (a, b) =>
      FAMILIARITY_ORDER[a.characterization] -
        FAMILIARITY_ORDER[b.characterization] || a.touchedFile.localeCompare(b.touchedFile)
  );

  const blastRadius = [...report.blastRadius].sort(
    (a, b) =>
      BLAST_RADIUS_ORDER[a.characterization] -
        BLAST_RADIUS_ORDER[b.characterization] ||
      b.dependentCount - a.dependentCount ||
      a.changedFile.localeCompare(b.changedFile)
  );

  const lines: string[] = [
    "Evidence Report",
    "===============",
    "",
    `Author: ${report.author.name} <${report.author.email}>`,
  ];

  if (report.changeReference !== undefined) {
    lines.push(`Change: ${report.changeReference}`);
  }

  lines.push(
    `Changed files (${report.changedFiles.length}):`,
    ...renderChangedFilesList(report.changedFiles, maxChangedFilesListed),
    "",
    "Familiarity",
    "-----------",
    "  How much the author has worked in each touched area over the last 6 months."
  );

  if (familiarity.length === 0) {
    lines.push("  (no touched areas to analyze)");
  } else {
    for (const finding of familiarity) {
      lines.push(...renderFamiliarityFinding(finding, asOf));
    }
  }

  lines.push(
    "",
    "Blast Radius",
    "------------",
    "  Direct static import and require() dependents of each changed JavaScript or TypeScript source file."
  );

  if (blastRadius.length === 0) {
    lines.push("  (no analyzable JS/TS changed files to analyze)");
  } else {
    for (const finding of blastRadius) {
      lines.push(...renderBlastRadiusFinding(finding));
    }
  }

  if (report.notAnalyzedForBlastRadius.length > 0) {
    lines.push("", "Not Analyzed for Blast Radius", "-----------------------------");
    lines.push(
      "  Blast-radius analysis covers JavaScript/TypeScript source files only."
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
