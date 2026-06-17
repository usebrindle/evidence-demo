/**
 * Pure blast-radius analyzer (core-destined).
 * Inputs: changed files and an import graph.
 */

import type { ImportGraph } from "../inputs/importGraphSource.js";

export type BlastRadiusCharacterization = "isolated" | "moderate" | "broad";

export interface BlastRadiusFinding {
  changedFile: string;
  dependentCount: number;
  dependents: readonly string[];
  characterization: BlastRadiusCharacterization;
}

export interface BlastRadiusInput {
  changedFiles: readonly string[];
  importGraph: ImportGraph;
}

export interface DirectImporterResult {
  dependentCount: number;
  dependents: readonly string[];
}

/**
 * Slice 1: count direct importers of one changed TypeScript file.
 * Pure — no file I/O; uses the injected import graph.
 */
export function countDirectImportersForFile(
  changedFile: string,
  importGraph: ImportGraph
): DirectImporterResult {
  const normalized = changedFile.replace(/\\/g, "/");
  const dependents = importGraph.get(normalized) ?? [];

  return {
    dependentCount: dependents.length,
    dependents,
  };
}

export function analyzeBlastRadius(
  _input: BlastRadiusInput
): BlastRadiusFinding[] {
  throw new Error("analyzeBlastRadius: not yet implemented");
}
