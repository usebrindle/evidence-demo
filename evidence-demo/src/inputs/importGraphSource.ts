/**
 * Impure edge: parses TypeScript imports from a local clone.
 * Builds reverse-dependency view: module → modules that import it.
 */

export type ImportGraph = ReadonlyMap<string, readonly string[]>;

export function createImportGraph(_repoPath: string): ImportGraph {
  throw new Error("createImportGraph: not yet implemented");
}
