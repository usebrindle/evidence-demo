/**
 * Pure blast-radius analyzer (core-destined).
 * Inputs: changed files and an import graph.
 */

import {
  isAnalyzableSourceFile,
  type ImportGraph,
} from "../inputs/importGraphSource.js";

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
 * Slice 1: count direct dependents of one changed JS/TS source file.
 * Includes edges from static ESM imports and static-literal require().
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

/** Max dependent paths included in a finding; full count stays in dependentCount. */
export const DEPENDENT_SAMPLE_SIZE = 5;

/**
 * Slice 2: characterize blast radius from direct dependent count.
 * isolated: 0-2, moderate: 3-10, broad: 11+.
 */
export function characterizeBlastRadius(
  dependentCount: number
): BlastRadiusCharacterization {
  if (dependentCount <= 2) {
    return "isolated";
  }
  if (dependentCount <= 10) {
    return "moderate";
  }
  return "broad";
}

export function sampleDependents(
  dependents: readonly string[],
  sampleSize: number = DEPENDENT_SAMPLE_SIZE
): readonly string[] {
  return dependents.slice(0, sampleSize);
}

/**
 * Slice 2: structured blast-radius finding per changed JS/TS source file.
 * Pure — no file I/O; uses the injected import graph.
 */
export function analyzeBlastRadius(input: BlastRadiusInput): BlastRadiusFinding[] {
  return input.changedFiles
    .filter(isAnalyzableSourceFile)
    .map((changedFile) => {
      const { dependentCount, dependents } = countDirectImportersForFile(
        changedFile,
        input.importGraph
      );

      return {
        changedFile: changedFile.replace(/\\/g, "/"),
        dependentCount,
        dependents: sampleDependents(dependents),
        characterization: characterizeBlastRadius(dependentCount),
      };
    });
}
