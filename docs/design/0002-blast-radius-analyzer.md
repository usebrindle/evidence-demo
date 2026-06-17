# Evidence demo LLD 0002 ... Blast-radius analyzer

## Purpose

Given a pull request's changed files and the repository's source, produce a finding that explains how broadly the changed files are depended upon by the rest of the codebase. This is the evidence behind Peter's second item ... a one-line change to a schema, auth helper, or shared package that many things import is riskier than a large isolated UI change. For the demo this covers JavaScript and TypeScript source files (`.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`), and it analyzes both ESM static `import` relationships and CommonJS `require()` relationships, because much real enterprise JavaScript, including SFCC and other Node codebases, wires modules together with `require()` rather than ESM imports. An analyzer blind to `require()` would be structurally blind on a large fraction of the repos that matter most, which would make blast radius untested on realistic code rather than merely rough.

## What it computes

It builds a reverse-dependency view of the changed files ... for each changed file, how many other modules in the repo depend on it, directly, whether through an ESM `import` or a CommonJS `require()`. From that it characterizes each changed file's blast radius (for example isolated, moderate, broad) and lists concrete dependents, because naming the files that depend on a changed module is far more convincing than a number alone.

The core signal is direct reverse-dependency breadth ... how many modules depend on this changed file. A changed file depended on by many modules has a broad blast radius. A changed file depended on by nothing (a leaf, like an isolated component or a script) has a small one.

## How it analyzes JavaScript and TypeScript

It walks the repository for in-scope JS/TS source files and parses each with the TypeScript compiler API (using the appropriate `ScriptKind` per extension) to extract dependency relationships, building a map from each module to the modules that depend on it. Two dependency forms are extracted:

- ESM static `import` statements and static `import(...)` / `export ... from` forms.
- CommonJS `require()` calls with a static string-literal specifier, for example `require('./foo')`.

Both forms feed the same reverse-dependency map, so a changed file is connected to its dependents regardless of whether they reach it by `import` or by `require()`. The analyzer resolves specifiers to files for the common case of relative and path-aliased references across `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, and `.cts`.

## CommonJS require, what is in and what is not

`require()` is messier than ESM `import`, and the analyzer draws an explicit, honest line.

In scope ... `require()` calls whose argument is a static string literal, including when assigned (`const x = require('./foo')`), when not assigned, and when nested inside a normal function or conditional block but still a literal specifier. These are statically resolvable and are treated exactly like an ESM import for reverse-dependency purposes.

Out of scope, and stated as a limitation ... dynamic requires whose specifier is not a static string literal (`require(someVariable)`, `require('./' + name)`, computed or templated paths), and any indirection where the module reference is built at runtime. These cannot be resolved by static parsing, so they are not counted, and the report says so. The analyzer does not attempt to evaluate expressions to guess a path, because a wrong guess is worse than an honest omission.

This line matters for credibility. The report states that it counts static `import` and static-literal `require()` dependents only, and that dynamic `require()` and runtime indirection are not counted, so a senior engineer reading "depended on by N modules" knows exactly what that number does and does not include.

## Path aliases, what is in and what is not

Real JS/TS repos often import via path aliases (`@/components/Foo`, `~/utils`) rather than relative paths. The analyzer resolves these using TypeScript `compilerOptions.paths` and `baseUrl` semantics, but only from a single config file at the repository root.

In scope ... `compilerOptions.paths` and `baseUrl` read from the repository root `tsconfig.json` or `jsconfig.json` (whichever is found first). Alias patterns and targets are applied the same way TypeScript would when resolving a module specifier from a file in the repo.

Out of scope, and stated as a limitation ... aliases defined only in bundler config (Vite `resolve.alias`, Webpack `alias`, and similar) when those entries are not mirrored in the root tsconfig/jsconfig; nested package `tsconfig.json` files in a monorepo (per-package paths, project references, or other nested configs); walking or merging multiple config files beyond that one root file. These are not read, so specifiers that resolve only through bundler or nested config will not connect edges in the dependency graph, and dependent counts may undercount.

Indirect win ... when a bundler's alias table mirrors the root tsconfig paths (a common setup), imports using those aliases are still resolved correctly because the root config carries the mapping. The limitation is about config source, not about every alias pattern in the wild.

The report limitations section states this explicitly: path aliases are resolved only from the repository root `tsconfig.json` or `jsconfig.json` (`compilerOptions.paths` / `baseUrl`); aliases defined only in bundler config (e.g. Vite, Webpack) or nested package configs are not applied. A senior engineer reading "depended on by no modules" on a heavily aliased import should check whether the alias is covered by root tsconfig before treating zero as isolated.

## Platform resolution beyond require, still out of scope

CommonJS support narrows but does not close the gap on platforms with their own module resolution. SFCC, for example, also wires modules through the cartridge path, template includes, and platform resolution that are not expressed as either ESM imports or literal `require()` calls. So even with `require()` support, blast radius on such platforms should be read as a lower bound, and the report and limitations say so. Closing the platform-resolution gap is deferred and is genuinely hard, exactly the robustness work Peter named.

## The contract, core-shaped

A pure function over inputs. Input ... the list of changed files and a representation of the repository's dependency graph (or a source of it). Output ... a structured blast-radius finding per changed file, each carrying the characterization, the count of direct dependents, and a sample of the dependent paths. No formatting, no CLI. The impure work of reading and parsing the repository is supplied at the edge by the CLI wrapper, so the analysis logic is pure and testable and can lift into the core later. The graph carries dependents regardless of whether the edge came from an `import` or a `require()`, so the pure analyzer does not need to know which mechanism produced an edge.

## Vertical slices

Slice 1 ... for one changed JS/TS file, count how many other files in the repo statically depend on it via ESM `import`, using parsed imports from a real repo. Return the count and the dependent paths. Proves the dependency-graph-to-finding path end to end.

Slice 2 ... characterize each changed file as isolated, moderate, or broad from its dependent count, and include a sample of dependents in the finding.

Slice 3 ... handle path-aliased references from root tsconfig/jsconfig paths in addition to relative ones, since real JS/TS repos use aliases and missing them would undercount dependents and mislead.

Slice 4 ... extract static-literal `require()` calls and fold them into the same reverse-dependency map, so `require`-based dependents are counted alongside `import`-based ones. Add fixtures covering a `.js` file required by other `.js` files, and confirm a dynamic `require(variable)` is not counted and triggers no false edge.

## Out of scope for the demo

The robustness items are deferred ... dynamic and computed `require()` and runtime module indirection (not statically resolvable), dynamic `import()` with a non-literal specifier, transitive dependency impact (the demo counts direct dependents only, not the full downstream reach), platform-specific resolution such as the SFCC cartridge path and template includes, generated code, monorepo package boundaries and cross-package resolution, bundler-only path aliases and nested package tsconfig paths (when not mirrored at the repo root), non-JS/TS source files (Python, Go, etc.), public-interface and API-surface analysis as a distinct signal, and config or schema files whose impact is real but not expressed through imports or requires. These are the hard parts Peter named, and several of them (transitive impact, public interface, platform resolution, config dependencies) are genuinely where the moat is. The demo computes direct static dependency breadth and is explicit in the report about exactly what it counts, so the reader is not misled about transitive reach or platform wiring.

## Notes for the report

As with familiarity, show the evidence, not just the label. "This file is depended on by 34 modules, including these" earns more trust than "blast radius ... broad." And the honesty about scope matters here for credibility with a senior engineer ... stating "direct static import and literal require dependents only, transitive and dynamic not counted" is the kind of accuracy that makes Peter trust the parts that are computed. On platforms with their own resolution, the report should note that the count is a lower bound, so a low number reads as "not seen by static analysis" rather than "definitely safe."

## Dependencies

Standalone for the demo. JavaScript and TypeScript source files only, ESM `import` and static-literal CommonJS `require()`. Core-destined. Pairs with the familiarity analyzer (LLD 0001) in the report (LLD 0003).
