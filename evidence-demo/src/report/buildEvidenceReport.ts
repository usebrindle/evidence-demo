/**
 * Pure: assembles analyzer findings into a structured evidence report.
 */

import type { FamiliarityFinding } from "../analyzers/familiarity.js";
import type { BlastRadiusFinding } from "../analyzers/blastRadius.js";
import type { AuthorIdentity } from "../inputs/changedFiles.js";
import { isAnalyzableSourceFile } from "../inputs/importGraphSource.js";

export interface EvidenceReport {
  author: AuthorIdentity;
  /** PR number, branch name, or commit range that was analyzed. */
  changeReference?: string;
  changedFiles: readonly string[];
  familiarity: readonly FamiliarityFinding[];
  blastRadius: readonly BlastRadiusFinding[];
  notAnalyzedForBlastRadius: readonly string[];
  limitations: readonly string[];
}

export interface BuildEvidenceReportInput {
  author: AuthorIdentity;
  changeReference?: string;
  changedFiles: readonly string[];
  familiarity: readonly FamiliarityFinding[];
  blastRadius: readonly BlastRadiusFinding[];
}

export function buildEvidenceReport(
  input: BuildEvidenceReportInput
): EvidenceReport {
  const analyzedFiles = new Set(input.blastRadius.map((f) => f.changedFile));
  const notAnalyzedForBlastRadius = input.changedFiles.filter(
    (file) => !isAnalyzableSourceFile(file) && !analyzedFiles.has(file)
  );

  return {
    author: input.author,
    changeReference: input.changeReference,
    changedFiles: input.changedFiles,
    familiarity: input.familiarity,
    blastRadius: input.blastRadius,
    notAnalyzedForBlastRadius,
    limitations: [
      "Direct static dependents only; transitive dependency impact is not computed.",
      "Blast radius counts static ESM import and static-literal CommonJS require() dependents; dynamic require(), runtime indirection, and non-literal dynamic import() are not counted; non-source files are excluded.",
      "On platforms with non-import/require wiring (e.g. SFCC cartridge paths), blast-radius counts may be a lower bound.",
      "Path aliases are resolved only from the repository root tsconfig.json or jsconfig.json (compilerOptions.paths / baseUrl). Aliases defined only in bundler config (e.g. Vite, Webpack) or nested package configs are not applied.",
      "Git history does not account for renames, squashes, co-authored commits, or bot attribution.",
      "Familiarity window is fixed at 6 months.",
      "No risk score or merge recommendation is produced.",
    ],
  };
}
