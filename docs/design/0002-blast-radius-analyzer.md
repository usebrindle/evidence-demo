# Evidence demo LLD 0002 ... Blast-radius analyzer

## Purpose

Given a pull request's changed files and the repository's source, produce a finding that explains how broadly the changed files are depended upon by the rest of the codebase. This is the evidence behind Peter's second item ... a one-line change to a schema, auth helper, or shared package that many things import is riskier than a large isolated UI change. For the demo this covers JavaScript and TypeScript source files (`.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`), because import analysis is language-specific and the TypeScript compiler API parses both JS and TS syntax well enough for static `import` extraction.

## What it computes

It builds a reverse-dependency view of the changed files ... for each changed file, how many other modules in the repo import it, directly. From that it characterizes each changed file's blast radius (for example isolated, moderate, broad) and lists concrete dependents, because naming the files that import a changed module is far more convincing than a number alone.

The core signal is direct reverse-dependency breadth ... how many modules import this changed file. A changed file imported by many modules has a broad blast radius. A changed file imported by nothing (a leaf, like an isolated component or a script) has a small one.

## How it analyzes JavaScript and TypeScript

It walks the repository for in-scope JS/TS source files and parses each with the TypeScript compiler API (using the appropriate `ScriptKind` per extension) to extract import relationships, building a map from each module to the modules that import it. Static `import` statements are the tractable, high-signal case and are what the demo handles; CommonJS `require()` is not analyzed. The analyzer resolves import specifiers to files well enough to connect a changed file to its importers for the common case of relative and path-aliased imports across `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, and `.cts`.

## The contract, core-shaped

A pure function over inputs. Input ... the list of changed files and a representation of the repository's import graph (or a source of it). Output ... a structured blast-radius finding per changed file, each carrying the characterization, the count of direct dependents, and a sample of the dependent paths. No formatting, no CLI. The impure work of reading and parsing the repository is supplied at the edge by the CLI wrapper, so the analysis logic is pure and testable and can lift into the core later.

## Vertical slices

Slice 1 ... for one changed JS/TS file, count how many other files in the repo statically import it, using parsed imports from a real repo. Return the count and the importer paths. Proves the import-graph-to-finding path end to end.

Slice 2 ... characterize each changed file as isolated, moderate, or broad from its dependent count, and include a sample of dependents in the finding.

Slice 3 ... handle path-aliased imports (tsconfig/jsconfig paths) in addition to relative imports, since real JS/TS repos use aliases and missing them would undercount dependents and mislead.

## Out of scope for the demo

The robustness items are deferred ... dynamic imports (not visible to static parsing), transitive dependency impact (the demo counts direct importers only, not the full downstream reach), generated code, monorepo package boundaries and cross-package resolution, non-JS/TS source files (Python, Go, etc.), CommonJS `require()` (not parsed), public-interface and API-surface analysis as a distinct signal, and config or schema files whose impact is real but not expressed through imports. These are the hard parts Peter named, and several of them (transitive impact, public interface, config dependencies) are genuinely where the moat is. The demo computes direct static import breadth and is explicit in the report that it shows direct importers only, so the reader is not misled about transitive reach.

## Notes for the report

As with familiarity, show the evidence, not just the label. "This file is imported by 34 modules, including these" earns more trust than "blast radius ... broad." And the honesty about scope matters here for credibility with a senior engineer ... stating "direct importers only, transitive not yet computed" is the kind of accuracy that makes Peter trust the parts that are computed.

## Dependencies

Standalone for the demo. JavaScript and TypeScript source files only. Core-destined. Pairs with the familiarity analyzer (LLD 0001) in the report (LLD 0003).
