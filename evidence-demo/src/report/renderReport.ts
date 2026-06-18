/**
 * Pure: renders a structured evidence report as human-readable text.
 */

import chalk, { Chalk, type ChalkInstance } from "chalk";

import type { BlastRadiusFinding } from "../analyzers/blastRadius.js";
import type { FamiliarityFinding } from "../analyzers/familiarity.js";
import type { EvidenceReport } from "./buildEvidenceReport.js";

export interface RenderReportOptions {
  /** Reference date for relative recency phrases (defaults to now). */
  asOf?: Date;
  /** Max changed files to list before truncating (defaults to 12). */
  maxChangedFilesListed?: number;
  /** When omitted, auto-detect from TTY and NO_COLOR / FORCE_COLOR. */
  color?: boolean;
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

interface ReportPalette {
  title: (text: string) => string;
  sectionHeader: (text: string) => string;
  sectionContext: (text: string) => string;
  metadata: (text: string) => string;
  filePath: (text: string) => string;
  limitation: (text: string) => string;
  familiarityCharacterization: (
    characterization: FamiliarityFinding["characterization"],
    text: string
  ) => string;
  blastCharacterization: (
    characterization: BlastRadiusFinding["characterization"],
    text: string
  ) => string;
}

/** Whether to emit ANSI colors (TTY + NO_COLOR / FORCE_COLOR conventions). */
export function shouldColorizeReport(
  stdout: { isTTY?: boolean } = process.stdout
): boolean {
  const noColor = process.env.NO_COLOR;
  if (noColor !== undefined && noColor !== "") {
    return false;
  }

  const forceColor = process.env.FORCE_COLOR;
  if (forceColor !== undefined && forceColor !== "") {
    return true;
  }

  return stdout.isTTY === true;
}

function resolveChalkInstance(colorOption: boolean | undefined): ChalkInstance | null {
  if (colorOption === false) {
    return null;
  }

  if (colorOption === true) {
    return new Chalk({ level: 3 });
  }

  if (!shouldColorizeReport()) {
    return null;
  }

  return chalk;
}

function createPalette(chalkInstance: ChalkInstance | null): ReportPalette {
  const plain = (text: string) => text;

  if (chalkInstance === null) {
    return {
      title: plain,
      sectionHeader: plain,
      sectionContext: plain,
      metadata: plain,
      filePath: plain,
      limitation: plain,
      familiarityCharacterization: (_characterization, text) => text,
      blastCharacterization: (_characterization, text) => text,
    };
  }

  return {
    title: (text) => chalkInstance.bold.cyan(text),
    sectionHeader: (text) => chalkInstance.bold.blue(text),
    sectionContext: (text) => chalkInstance.dim(text),
    metadata: (text) => chalkInstance.dim(text),
    filePath: (text) => chalkInstance.bold(text),
    limitation: (text) => chalkInstance.dim(text),
    familiarityCharacterization: (characterization, text) => {
      switch (characterization) {
        case "none":
          return chalkInstance.yellow(text);
        case "moderate":
          return chalkInstance.yellow(text);
        case "high":
          return chalkInstance.green(text);
      }
    },
    blastCharacterization: (characterization, text) => {
      switch (characterization) {
        case "broad":
          return chalkInstance.red(text);
        case "moderate":
          return chalkInstance.yellow(text);
        case "isolated":
          return chalkInstance.dim(text);
      }
    },
  };
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

function formatFileLabel(filePath: string): string {
  return filePath === "." ? "(repository root)" : filePath;
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
    return `No author commits to this file in 6 months; ${othersPhrase} in this window.`;
  }

  const authorCommitsPhrase =
    finding.authorCommitCount === 1
      ? "1 commit"
      : `${finding.authorCommitCount} commits`;

  if (othersCommitCount === 0) {
    return `Author has ${authorCommitsPhrase} to this file in 6 months (sole contributor in window), ${lastTouchPhrase}.`;
  }

  const sharePhrase = ` (${formatShare(finding.shareOfFileCommitChurn)} of file churn)`;
  const othersPhrase =
    othersCommitCount === 1
      ? "1 commit by others"
      : `${othersCommitCount} commits by others`;

  return `Author has ${authorCommitsPhrase} to this file in 6 months${sharePhrase}, ${lastTouchPhrase}; ${othersPhrase} in this window (${finding.totalFileCommitCount} total).`;
}

function renderFamiliarityFinding(
  finding: FamiliarityFinding,
  asOf: Date,
  palette: ReportPalette
): string[] {
  const fileLabel = palette.filePath(formatFileLabel(finding.touchedFile));
  const characterization = palette.familiarityCharacterization(
    finding.characterization,
    finding.characterization
  );

  return [
    `  ${fileLabel} — ${characterization}`,
    `    ${formatFamiliarityDetail(finding, asOf)}`,
  ];
}

function formatDirectImporterPhrase(directDependentCount: number): string {
  return directDependentCount === 1
    ? "1 direct importer"
    : `${directDependentCount} direct importers`;
}

function formatDependentSample(finding: BlastRadiusFinding): string {
  const {
    directDependentCount,
    directDependents,
    transitiveReachCount,
  } = finding;

  if (transitiveReachCount === directDependentCount) {
    if (directDependentCount === 0) {
      return "Depended on by no modules.";
    }

    const moduleWord = directDependentCount === 1 ? "module" : "modules";
    const remaining = directDependentCount - directDependents.length;

    if (directDependents.length === 0) {
      return `Depended on by ${directDependentCount} ${moduleWord}.`;
    }

    const listed = directDependents.join(", ");
    if (remaining <= 0) {
      return `Depended on by ${directDependentCount} ${moduleWord}, including ${listed}.`;
    }

    const moreWord = remaining === 1 ? "1 more" : `${remaining} more`;
    return `Depended on by ${directDependentCount} ${moduleWord}, including ${listed} (and ${moreWord}).`;
  }

  const transitiveWord = transitiveReachCount === 1 ? "module" : "modules";
  const prefix = `Reach: ${transitiveReachCount} ${transitiveWord} transitively (${formatDirectImporterPhrase(directDependentCount)})`;
  const remaining = directDependentCount - directDependents.length;

  if (directDependents.length === 0) {
    return `${prefix}.`;
  }

  const listed = directDependents.join(", ");
  if (remaining <= 0) {
    return `${prefix}, including ${listed}.`;
  }

  const moreWord = remaining === 1 ? "1 more" : `${remaining} more`;
  return `${prefix}, including ${listed} (and ${moreWord}).`;
}

function renderBlastRadiusFinding(
  finding: BlastRadiusFinding,
  palette: ReportPalette
): string[] {
  const changedFile = palette.filePath(finding.changedFile);
  const characterization = palette.blastCharacterization(
    finding.characterization,
    finding.characterization
  );

  return [
    `  ${changedFile} — ${characterization}`,
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
  const palette = createPalette(resolveChalkInstance(options.color));

  const familiarity = [...report.familiarity].sort(
    (a, b) =>
      FAMILIARITY_ORDER[a.characterization] -
        FAMILIARITY_ORDER[b.characterization] || a.touchedFile.localeCompare(b.touchedFile)
  );

  const blastRadius = [...report.blastRadius].sort(
    (a, b) =>
      BLAST_RADIUS_ORDER[a.characterization] -
        BLAST_RADIUS_ORDER[b.characterization] ||
      b.transitiveReachCount - a.transitiveReachCount ||
      b.directDependentCount - a.directDependentCount ||
      a.changedFile.localeCompare(b.changedFile)
  );

  const lines: string[] = [
    palette.title("Evidence Report"),
    palette.title("==============="),
    "",
    palette.metadata(`Author: ${report.author.name} <${report.author.email}>`),
  ];

  if (report.changeReference !== undefined) {
    lines.push(palette.metadata(`Change: ${report.changeReference}`));
  }

  lines.push(
    `Changed files (${report.changedFiles.length}):`,
    ...renderChangedFilesList(report.changedFiles, maxChangedFilesListed),
    "",
    palette.sectionHeader("Familiarity"),
    palette.sectionHeader("-----------"),
    palette.sectionContext(
      "  How much the author has worked on each changed file over the last 6 months."
    )
  );

  if (familiarity.length === 0) {
    lines.push("  (no changed files to analyze)");
  } else {
    for (const finding of familiarity) {
      lines.push(...renderFamiliarityFinding(finding, asOf, palette));
    }
  }

  lines.push(
    "",
    palette.sectionHeader("Blast Radius"),
    palette.sectionHeader("------------"),
    palette.sectionContext(
      "  Direct static import and require() dependents of each changed JavaScript or TypeScript source file."
    )
  );

  if (blastRadius.length === 0) {
    lines.push("  (no analyzable JS/TS changed files to analyze)");
  } else {
    for (const finding of blastRadius) {
      lines.push(...renderBlastRadiusFinding(finding, palette));
    }
  }

  if (report.notAnalyzedForBlastRadius.length > 0) {
    lines.push(
      "",
      palette.sectionHeader("Not Analyzed for Blast Radius"),
      palette.sectionHeader("-----------------------------")
    );
    lines.push(
      palette.sectionContext(
        "  Blast-radius analysis covers JavaScript/TypeScript source files only."
      )
    );
    for (const file of report.notAnalyzedForBlastRadius) {
      lines.push(`  ${file}`);
    }
  }

  lines.push(
    "",
    palette.sectionHeader("Limitations"),
    palette.sectionHeader("-----------")
  );
  for (const limitation of report.limitations) {
    lines.push(palette.limitation(`  - ${limitation}`));
  }

  return lines.join("\n");
}
