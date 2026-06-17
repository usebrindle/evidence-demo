/**
 * Pure: assembles analyzer findings into a structured evidence report.
 */

import type { FamiliarityFinding } from "../analyzers/familiarity.js";
import type { BlastRadiusFinding } from "../analyzers/blastRadius.js";
import type { AuthorIdentity } from "../inputs/changedFiles.js";

export interface EvidenceReport {
  author: AuthorIdentity;
  changedFiles: readonly string[];
  familiarity: readonly FamiliarityFinding[];
  blastRadius: readonly BlastRadiusFinding[];
  notAnalyzedForBlastRadius: readonly string[];
  limitations: readonly string[];
}

export interface BuildEvidenceReportInput {
  author: AuthorIdentity;
  changedFiles: readonly string[];
  familiarity: readonly FamiliarityFinding[];
  blastRadius: readonly BlastRadiusFinding[];
}

export function buildEvidenceReport(
  input: BuildEvidenceReportInput
): EvidenceReport {
  const tsExtensions = [".ts", ".tsx", ".mts", ".cts"];
  const isTypeScript = (file: string): boolean =>
    tsExtensions.some((ext) => file.endsWith(ext));

  const analyzedFiles = new Set(input.blastRadius.map((f) => f.changedFile));
  const notAnalyzedForBlastRadius = input.changedFiles.filter(
    (file) => !isTypeScript(file) && !analyzedFiles.has(file)
  );

  return {
    author: input.author,
    changedFiles: input.changedFiles,
    familiarity: input.familiarity,
    blastRadius: input.blastRadius,
    notAnalyzedForBlastRadius,
    limitations: [
      "Direct static importers only; transitive dependency impact is not computed.",
      "TypeScript static imports only; dynamic imports and non-TS files are excluded from blast-radius analysis.",
      "Git history does not account for renames, squashes, co-authored commits, or bot attribution.",
      "Familiarity window is fixed at 6 months.",
      "No risk score or merge recommendation is produced.",
    ],
  };
}
