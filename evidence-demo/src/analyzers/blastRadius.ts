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

export function analyzeBlastRadius(
  _input: BlastRadiusInput
): BlastRadiusFinding[] {
  throw new Error("analyzeBlastRadius: not yet implemented");
}
