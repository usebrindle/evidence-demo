#!/usr/bin/env node

import { fileURLToPath } from "node:url";

/**
 * Evidence Demo CLI — arg parsing and orchestration (throwaway wrapper).
 * Slice 1+: resolve change → run analyzers → build report → render → print.
 */

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

  console.log("evidence-demo: not yet implemented");
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main();
}
