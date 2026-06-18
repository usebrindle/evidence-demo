/**
 * Impure edge: parses JS/TS static imports and static-literal require() from a local clone.
 * Builds reverse-dependency view: module → modules that import or require it.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import postcssScss from "postcss-scss";
import ts from "typescript";

export type ImportGraph = ReadonlyMap<string, readonly string[]>;

const IN_SCOPE_SOURCE_EXTENSION =
  /\.(jsx?|mjs|cjs|tsx?|mts|cts|css|scss|sass)$/;

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

export function isStylesheetFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return /\.(css|scss|sass)$/.test(normalized);
}

export function collectSourceFiles(repoPath: string): string[] {
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

const STYLESHEET_EXTENSIONS = ["scss", "sass", "css"] as const;

function buildStylesheetResolutionCandidates(relativeBase: string): string[] {
  const normalized = relativeBase.replace(/\\/g, "/");

  if (/\.(css|scss|sass)$/.test(normalized)) {
    return [normalized];
  }

  const slashIndex = normalized.lastIndexOf("/");
  const dir = slashIndex === -1 ? "" : normalized.slice(0, slashIndex);
  const base = slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1);
  const prefix = dir.length === 0 ? "" : `${dir}/`;

  const candidates: string[] = [
    normalized,
    ...STYLESHEET_EXTENSIONS.map((ext) => `${normalized}.${ext}`),
  ];

  for (const ext of STYLESHEET_EXTENSIONS) {
    candidates.push(`${prefix}_${base}.${ext}`);
  }
  for (const ext of STYLESHEET_EXTENSIONS) {
    candidates.push(`${prefix}${base}.${ext}`);
  }

  return candidates;
}

function resolveFirstExistingStylesheetCandidate(
  repoPath: string,
  candidates: readonly string[]
): string | null {
  for (const candidate of candidates) {
    const full = path.join(repoPath, candidate);
    if (existsSync(full) && statSync(full).isFile()) {
      return candidate;
    }
  }

  return null;
}

function resolveRelativeStylesheetModule(
  repoPath: string,
  importerRelativePath: string,
  specifier: string
): string | null {
  const importerDir = path.dirname(path.join(repoPath, importerRelativePath));
  const joined = path.resolve(importerDir, specifier);
  const relativeBase = normalizeRepoPath(path.relative(repoPath, joined));

  if (relativeBase.startsWith("..")) {
    return null;
  }

  return resolveFirstExistingStylesheetCandidate(
    repoPath,
    buildStylesheetResolutionCandidates(relativeBase)
  );
}

function resolvePathAliasToStylesheetCandidates(
  specifier: string,
  compilerOptions: ts.CompilerOptions,
  configDir: string
): string[] {
  const paths = compilerOptions.paths;
  if (!paths) {
    return [];
  }

  const baseUrl = compilerOptions.baseUrl ?? ".";
  const absoluteBase = path.resolve(configDir, baseUrl);
  const candidates: string[] = [];

  for (const [pattern, replacements] of Object.entries(paths)) {
    const starIndex = pattern.indexOf("*");
    if (starIndex === -1) {
      if (specifier !== pattern) {
        continue;
      }

      for (const replacement of replacements) {
        candidates.push(path.resolve(absoluteBase, replacement));
      }
      continue;
    }

    const prefix = pattern.slice(0, starIndex);
    const suffix = pattern.slice(starIndex + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
      continue;
    }

    const matched = specifier.slice(prefix.length, specifier.length - suffix.length);
    for (const replacement of replacements) {
      candidates.push(
        path.resolve(absoluteBase, replacement.replace("*", matched))
      );
    }
  }

  return candidates;
}

function resolveAliasedStylesheetModule(
  repoPath: string,
  importerRelativePath: string,
  specifier: string,
  compilerOptions: ts.CompilerOptions
): string | null {
  const aliased = resolveAliasedModule(
    repoPath,
    importerRelativePath,
    specifier,
    compilerOptions
  );
  if (aliased !== null && isStylesheetFile(aliased)) {
    return aliased;
  }

  const configPath = findTsConfig(repoPath);
  if (configPath === null) {
    return null;
  }

  const configDir = path.dirname(configPath);
  const aliasCandidates = resolvePathAliasToStylesheetCandidates(
    specifier,
    compilerOptions,
    configDir
  );

  for (const absoluteCandidate of aliasCandidates) {
    if (!isPathInsideRepo(repoPath, absoluteCandidate)) {
      continue;
    }

    const relativeBase = normalizeRepoPath(path.relative(repoPath, absoluteCandidate));
    const resolved = resolveFirstExistingStylesheetCandidate(
      repoPath,
      buildStylesheetResolutionCandidates(relativeBase)
    );
    if (resolved !== null) {
      return resolved;
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
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
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

function extractStaticQuotedPathFromImportParams(params: string): string | null {
  const trimmed = params.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const urlMatch = trimmed.match(/^url\s*\(\s*(['"])([^'"]+)\1\s*\)/i);
  if (urlMatch) {
    return urlMatch[2];
  }

  if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
    const quote = trimmed[0];
    const endQuote = trimmed.indexOf(quote, 1);
    if (endQuote > 1) {
      return trimmed.slice(1, endQuote);
    }
  }

  return null;
}

function extractStaticQuotedStylesheetSpecifier(params: string): string | null {
  return extractStaticQuotedPathFromImportParams(params);
}

function extractStylesheetAtRuleSpecifiers(
  sourceText: string,
  filePath: string,
  parseStylesheet: (source: string, opts?: { from?: string }) => postcss.Root,
  includeScssModuleRules: boolean
): string[] {
  try {
    const root = parseStylesheet(sourceText, { from: filePath });
    const specifiers: string[] = [];

    const walkRule = (ruleName: string): void => {
      root.walkAtRules(ruleName, (rule) => {
        const specifier = extractStaticQuotedStylesheetSpecifier(rule.params);
        if (specifier !== null) {
          specifiers.push(specifier);
        }
      });
    };

    walkRule("import");
    if (includeScssModuleRules) {
      walkRule("use");
      walkRule("forward");
    }

    return specifiers;
  } catch {
    return [];
  }
}

function extractCssStylesheetSpecifiers(
  sourceText: string,
  filePath: string
): string[] {
  return extractStylesheetAtRuleSpecifiers(
    sourceText,
    filePath,
    postcss.parse,
    false
  );
}

function extractScssStylesheetSpecifiers(
  sourceText: string,
  filePath: string
): string[] {
  return extractStylesheetAtRuleSpecifiers(
    sourceText,
    filePath,
    postcssScss.parse,
    true
  );
}

function resolveStylesheetModule(
  repoPath: string,
  importerRelativePath: string,
  specifier: string,
  compilerOptions: ts.CompilerOptions | null
): string | null {
  if (specifier.startsWith("sass:")) {
    return null;
  }

  if (specifier.startsWith(".")) {
    return resolveRelativeStylesheetModule(
      repoPath,
      importerRelativePath,
      specifier
    );
  }

  const relative = resolveRelativeStylesheetModule(
    repoPath,
    importerRelativePath,
    specifier
  );
  if (relative !== null) {
    return relative;
  }

  if (compilerOptions === null) {
    return null;
  }

  return resolveAliasedStylesheetModule(
    repoPath,
    importerRelativePath,
    specifier,
    compilerOptions
  );
}

function addImporterEdge(
  graph: Map<string, Set<string>>,
  target: string,
  importer: string
): void {
  const importers = graph.get(target) ?? new Set<string>();
  importers.add(importer);
  graph.set(target, importers);
}

export function createImportGraph(repoPath: string): ImportGraph {
  const resolvedRepo = path.resolve(repoPath);
  const compilerOptions = loadCompilerOptions(resolvedRepo);
  const sourceFiles = collectSourceFiles(resolvedRepo);
  const graph = new Map<string, Set<string>>();

  for (const file of sourceFiles) {
    const fullPath = path.join(resolvedRepo, file);
    const sourceText = readFileSync(fullPath, "utf8");

    if (isStylesheetFile(file)) {
      const specifiers = file.endsWith(".scss")
        ? extractScssStylesheetSpecifiers(sourceText, file)
        : file.endsWith(".css")
          ? extractCssStylesheetSpecifiers(sourceText, file)
          : [];

      for (const specifier of specifiers) {
        const target = resolveStylesheetModule(
          resolvedRepo,
          file,
          specifier,
          compilerOptions
        );
        if (target === null) {
          continue;
        }

        addImporterEdge(graph, target, file);
      }
      continue;
    }

    const specifiers = extractImportSpecifiers(sourceText, file);

    for (const specifier of specifiers) {
      const target = resolveModule(resolvedRepo, file, specifier, compilerOptions);
      if (target === null) {
        continue;
      }

      addImporterEdge(graph, target, file);
    }
  }

  const result = new Map<string, readonly string[]>();
  for (const [modulePath, importers] of graph) {
    result.set(modulePath, [...importers].sort());
  }

  return result;
}
