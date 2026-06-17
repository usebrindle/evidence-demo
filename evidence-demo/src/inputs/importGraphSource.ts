/**
 * Impure edge: parses TypeScript imports from a local clone.
 * Builds reverse-dependency view: module → modules that import it.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export type ImportGraph = ReadonlyMap<string, readonly string[]>;

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-test",
  ".git",
  "coverage",
]);

function normalizeRepoPath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function collectTypeScriptFiles(repoPath: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        walk(path.join(dir, entry.name));
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(
          normalizeRepoPath(path.relative(repoPath, path.join(dir, entry.name)))
        );
      }
    }
  }

  walk(repoPath);
  return files.sort();
}

function resolveRelativeModule(
  repoPath: string,
  importerRelativePath: string,
  specifier: string
): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const importerDir = path.dirname(path.join(repoPath, importerRelativePath));
  const joined = path.resolve(importerDir, specifier);
  const relativeBase = normalizeRepoPath(path.relative(repoPath, joined));

  const candidates = [
    relativeBase,
    `${relativeBase}.ts`,
    `${relativeBase}.tsx`,
    `${relativeBase}.js`,
    `${relativeBase}.jsx`,
    `${relativeBase}/index.ts`,
    `${relativeBase}/index.tsx`,
  ];

  for (const candidate of candidates) {
    const full = path.join(repoPath, candidate);
    if (existsSync(full) && statSync(full).isFile()) {
      return candidate;
    }
  }

  return null;
}

function extractRelativeImportSpecifiers(
  sourceText: string,
  filePath: string
): string[] {
  const scriptKind = filePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );

  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

export function createImportGraph(repoPath: string): ImportGraph {
  const resolvedRepo = path.resolve(repoPath);
  const tsFiles = collectTypeScriptFiles(resolvedRepo);
  const graph = new Map<string, Set<string>>();

  for (const file of tsFiles) {
    const fullPath = path.join(resolvedRepo, file);
    const sourceText = readFileSync(fullPath, "utf8");
    const specifiers = extractRelativeImportSpecifiers(sourceText, file);

    for (const specifier of specifiers) {
      const target = resolveRelativeModule(resolvedRepo, file, specifier);
      if (target === null) {
        continue;
      }

      const importers = graph.get(target) ?? new Set<string>();
      importers.add(file);
      graph.set(target, importers);
    }
  }

  const result = new Map<string, readonly string[]>();
  for (const [modulePath, importers] of graph) {
    result.set(modulePath, [...importers].sort());
  }

  return result;
}
