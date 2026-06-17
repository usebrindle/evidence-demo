/**
 * Impure edge: resolves a PR or commit range to changed files and author.
 */

export interface AuthorIdentity {
  name: string;
  email: string;
}

export interface ChangedFilesResult {
  changedFiles: string[];
  author: AuthorIdentity;
}

export interface ChangedFilesInput {
  repoPath: string;
  prOrRange: string;
}

export function resolveChangedFiles(
  _input: ChangedFilesInput
): ChangedFilesResult {
  throw new Error("resolveChangedFiles: not yet implemented");
}
