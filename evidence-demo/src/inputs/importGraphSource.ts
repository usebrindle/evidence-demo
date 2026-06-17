/**
 * Impure edge: parses JS/TS imports from a local clone.
 * Builds reverse-dependency view: module → modules that import it.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export type ImportGraph = ReadonlyMap<string, readonly string[]>;

const IN_SCOPE_SOURCE_EXTENSION = /\.(jsx?|mjs|cjs|tsx?|mts|cts)$/;

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

export function isAnalyzableSourceFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return IN_SCOPE_SOURCE_EXTENSION.test(normalized);
}

function collectSourceFiles(repoPath: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        walk(path.join(dir, entry.name));
      } else if (isAnalyzableSourceFile(entry.name)) {
        files.push(
          normalizeRepoPath(path.relative(repoPath, path.join(dir, entry.name)))
        );
      }
    }
  }

  walk(repoPath);
  return files.sort();
}

function findTsConfig(repoPath: string): string | null {
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    const candidate = path.join(repoPath, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadCompilerOptions(repoPath: string): ts.CompilerOptions | null {
  const configPath = findTsConfig(repoPath);
  if (configPath === null) {
    return null;
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    return null;
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  );

  if (!parsed.options.paths && !parsed.options.baseUrl) {
    return null;
  }

  return parsed.options;
}

function resolveRelativeModule(
  repoPath: string,
  importerRelativePath: string,
  specifier: string
): string | null {
  const importerDir = path.dirname(path.join(repoPath, importerRelativePath));
  const joined = path.resolve(importerDir, specifier);
  const relativeBase = normalizeRepoPath(path.relative(repoPath, joined));

  const candidates = [
    relativeBase,
    `${relativeBase}.ts`,
    `${relativeBase}.tsx`,
    `${relativeBase}.mts`,
    `${relativeBase}.cts`,
    `${relativeBase}.js`,
    `${relativeBase}.jsx`,
    `${relativeBase}.mjs`,
    `${relativeBase}.cjs`,
    `${relativeBase}/index.ts`,
    `${relativeBase}/index.tsx`,
    `${relativeBase}/index.mts`,
    `${relativeBase}/index.cts`,
    `${relativeBase}/index.js`,
    `${relativeBase}/index.jsx`,
    `${relativeBase}/index.mjs`,
    `${relativeBase}/index.cjs`,
  ];

  for (const candidate of candidates) {
    const full = path.join(repoPath, candidate);
    if (existsSync(full) && statSync(full).isFile()) {
      return candidate;
    }
  }

  return null;
}

function createModuleResolutionHost(repoPath: string): ts.ModuleResolutionHost {
  return {
    fileExists: (fileName) => existsSync(fileName),
    readFile: (fileName) => readFileSync(fileName, "utf8"),
    directoryExists: (dirName) =>
      existsSync(dirName) && statSync(dirName).isDirectory(),
    getCurrentDirectory: () => repoPath,
    realpath: (fileName) => fileName,
  };
}

function isPathInsideRepo(repoPath: string, filePath: string): boolean {
  const resolvedRepo = path.resolve(repoPath);
  const resolvedFile = path.resolve(filePath);
  const relative = path.relative(resolvedRepo, resolvedFile);
  return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveAliasedModule(
  repoPath: string,
  importerRelativePath: string,
  specifier: string,
  compilerOptions: ts.CompilerOptions
): string | null {
  const containingFile = path.join(repoPath, importerRelativePath);
  const host = createModuleResolutionHost(repoPath);
  const result = ts.resolveModuleName(
    specifier,
    containingFile,
    compilerOptions,
    host
  );

  if (!result.resolvedModule) {
    return null;
  }

  const resolvedFileName = result.resolvedModule.resolvedFileName;
  if (!isPathInsideRepo(repoPath, resolvedFileName)) {
    return null;
  }

  if (!isAnalyzableSourceFile(resolvedFileName)) {
    return null;
  }

  return normalizeRepoPath(path.relative(repoPath, resolvedFileName));
}

function resolveModule(
  repoPath: string,
  importerRelativePath: string,
  specifier: string,
  compilerOptions: ts.CompilerOptions | null
): string | null {
  if (specifier.startsWith(".")) {
    return resolveRelativeModule(repoPath, importerRelativePath, specifier);
  }

  if (compilerOptions === null) {
    return null;
  }

  return resolveAliasedModule(
    repoPath,
    importerRelativePath,
    specifier,
    compilerOptions
  );
}

function scriptKindForFile(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (filePath.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (
    filePath.endsWith(".ts") ||
    filePath.endsWith(".mts") ||
    filePath.endsWith(".cts")
  ) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

function extractImportSpecifiers(
  sourceText: string,
  filePath: string
): string[] {
  const scriptKind = scriptKindForFile(filePath);
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
  const compilerOptions = loadCompilerOptions(resolvedRepo);
  const sourceFiles = collectSourceFiles(resolvedRepo);
  const graph = new Map<string, Set<string>>();

  for (const file of sourceFiles) {
    const fullPath = path.join(resolvedRepo, file);
    const sourceText = readFileSync(fullPath, "utf8");
    const specifiers = extractImportSpecifiers(sourceText, file);

    for (const specifier of specifiers) {
      const target = resolveModule(resolvedRepo, file, specifier, compilerOptions);
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
