/**
 * Pure: assembles analyzer findings into a structured evidence report.
 */

import type { FamiliarityFinding } from "../analyzers/familiarity.js";
import type { BlastRadiusFinding } from "../analyzers/blastRadius.js";
import type { AuthorIdentity, ChangedFileEntry } from "../inputs/changedFiles.js";
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
  changedFiles: readonly ChangedFileEntry[];
  familiarity: readonly FamiliarityFinding[];
  blastRadius: readonly BlastRadiusFinding[];
}

export function buildEvidenceReport(
  input: BuildEvidenceReportInput
): EvidenceReport {
  const changedFilePaths = input.changedFiles.map((entry) => entry.path);
  const analyzedFiles = new Set(input.blastRadius.map((f) => f.changedFile));
  const notAnalyzedForBlastRadius = changedFilePaths.filter(
    (file) => !isAnalyzableSourceFile(file) && !analyzedFiles.has(file)
  );

  return {
    author: input.author,
    changeReference: input.changeReference,
    changedFiles: changedFilePaths,
    familiarity: input.familiarity,
    blastRadius: input.blastRadius,
    notAnalyzedForBlastRadius,
    limitations: [
      "Transitive reach and direct dependent counts follow static ESM import and static-literal CommonJS require() chains; dynamic require(), runtime indirection, and non-literal dynamic import() are not counted; non-source files are excluded.",
      "On platforms with non-import/require wiring (e.g. SFCC cartridge paths), blast-radius counts may be a lower bound.",
      "Path aliases are resolved only from the repository root tsconfig.json or jsconfig.json (compilerOptions.paths / baseUrl). Aliases defined only in bundler config (e.g. Vite, Webpack) or nested package configs are not applied.",
      "Familiarity uses git blame at merge-base for content ownership and windowed line churn; commit counts and recency come from git log up to merge-base only. PR commits and line changes on the PR branch are excluded. Commit-share is reported separately and is not a substitute for line ownership.",
      "Git history and blame do not account for renames, squashes, co-authored commits, or bot attribution. Line ownership on generated, minified, or binary files may be misleading or unavailable.",
      "Familiarity window is fixed at 6 months; recency gates the characterization label—high current-line ownership without a recent touch does not yield high.",
      "No risk score or merge recommendation is produced.",
    ],
  };
}
