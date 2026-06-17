/**
 * Pure: renders a structured evidence report as human-readable text.
 */

import type { EvidenceReport } from "./buildEvidenceReport.js";

export function renderReport(report: EvidenceReport): string {
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
    lines.push("  (no familiarity findings yet)");
  } else {
    for (const finding of report.familiarity) {
      lines.push(`  ${finding.area}: ${finding.characterization}`);
    }
  }

  lines.push("", "Blast Radius", "------------");

  if (report.blastRadius.length === 0) {
    lines.push("  (no blast-radius findings yet)");
  } else {
    for (const finding of report.blastRadius) {
      lines.push(
        `  ${finding.changedFile}: ${finding.characterization} (${finding.dependentCount} importers)`
      );
    }
  }

  if (report.notAnalyzedForBlastRadius.length > 0) {
    lines.push("", "Not Analyzed for Blast Radius", "-----------------------------");
    for (const file of report.notAnalyzedForBlastRadius) {
      lines.push(`  ${file}`);
    }
    lines.push("  (TypeScript static imports only)");
  }

  lines.push("", "Limitations", "-----------");
  for (const limitation of report.limitations) {
    lines.push(`  - ${limitation}`);
  }

  return lines.join("\n");
}
