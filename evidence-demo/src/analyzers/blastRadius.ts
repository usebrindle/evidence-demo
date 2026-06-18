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
  directDependentCount: number;
  directDependents: readonly string[];
  transitiveReachCount: number;
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

export interface TransitiveReachResult {
  transitiveReachCount: number;
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

/**
 * Slice 5: count all unique ancestor modules that depend on a changed file,
 * walking upward through the reverse-dependency graph (direct importers and
 * their importers). Excludes the changed file from the count.
 */
export function countTransitiveReachForFile(
  changedFile: string,
  importGraph: ImportGraph
): TransitiveReachResult {
  const normalized = changedFile.replace(/\\/g, "/");
  const visited = new Set<string>();
  const queue: string[] = [...(importGraph.get(normalized) ?? [])];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === normalized || visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const importer of importGraph.get(current) ?? []) {
      if (importer !== normalized && !visited.has(importer)) {
        queue.push(importer);
      }
    }
  }

  return { transitiveReachCount: visited.size };
}

/** Max direct-dependent paths included in a finding; full count stays in directDependentCount. */
export const DEPENDENT_SAMPLE_SIZE = 5;

/**
 * Slice 2 / Slice 5: characterize blast radius from reach count (transitive reach).
 * isolated: 0-2, moderate: 3-10, broad: 11+.
 */
export function characterizeBlastRadius(
  reachCount: number
): BlastRadiusCharacterization {
  if (reachCount <= 2) {
    return "isolated";
  }
  if (reachCount <= 10) {
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
      const { transitiveReachCount } = countTransitiveReachForFile(
        changedFile,
        input.importGraph
      );

      return {
        changedFile: changedFile.replace(/\\/g, "/"),
        directDependentCount: dependentCount,
        directDependents: sampleDependents(dependents),
        transitiveReachCount,
        characterization: characterizeBlastRadius(transitiveReachCount),
      };
    });
}
