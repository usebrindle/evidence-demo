#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeFamiliarity } from "./analyzers/familiarity.js";
import { resolveChangedFiles } from "./inputs/changedFiles.js";
import { createGitHistorySource } from "./inputs/gitHistorySource.js";
import { buildEvidenceReport } from "./report/buildEvidenceReport.js";
import { renderReport } from "./report/renderReport.js";

/**
 * Evidence Demo CLI — arg parsing and orchestration (throwaway wrapper).
 * Slice 1: resolve change → familiarity analyzer → build report → render → print.
 */

export interface RunEvidenceDemoOptions {
  /** Reference date for history window and recency (defaults to now). */
  asOf?: Date;
}

/**
 * Orchestrate a familiarity-only evidence report from a local clone.
 * Reads only the local repository; nothing is transmitted or stored.
 */
export function runEvidenceDemo(
  repoPath: string,
  prOrRange: string,
  options: RunEvidenceDemoOptions = {}
): string {
  const resolvedRepo = path.resolve(repoPath);
  const asOf = options.asOf ?? new Date();

  const { changedFiles, author } = resolveChangedFiles({
    repoPath: resolvedRepo,
    prOrRange,
  });

  const historySource = createGitHistorySource(resolvedRepo);
  const familiarity = analyzeFamiliarity(
    {
      author,
      touchedPaths: changedFiles,
      historySource,
    },
    asOf
  );

  const report = buildEvidenceReport({
    author,
    changedFiles,
    familiarity,
    blastRadius: [],
  });

  return renderReport(report, { asOf });
}

export function main(argv: string[] = process.argv.slice(2)): void {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: evidence-demo <repo-path> <pr-or-range>

Analyze a local cloned repository and print an evidence report.

Arguments:
  repo-path    Path to a local git clone
  pr-or-range  PR number, branch name, or base...head commit range

Options:
  -h, --help   Show this help message`);
    return;
  }

  if (argv.length < 2) {
    console.error("evidence-demo: expected <repo-path> <pr-or-range>");
    process.exit(1);
  }

  if (argv.length > 2) {
    console.error(
      "evidence-demo: too many arguments; expected <repo-path> <pr-or-range>"
    );
    process.exit(1);
  }

  const [repoPath, prOrRange] = argv;

  try {
    console.log(runEvidenceDemo(repoPath, prOrRange));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`evidence-demo: ${message}`);
    process.exit(1);
  }
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main();
}
