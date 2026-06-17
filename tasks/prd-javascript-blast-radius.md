# PRD: JavaScript Blast-Radius Extension

## Introduction

The evidence-demo blast-radius analyzer was designed and built for **TypeScript-only** static import analysis (see [docs/design/0002-blast-radius-analyzer.md](../docs/design/0002-blast-radius-analyzer.md)). In practice, many candidate repos — including mixed TS/JS codebases and plain JavaScript projects — use `.js`, `.jsx`, `.mjs`, and `.cjs` modules that share the same ESM `import`/`export` syntax the analyzer already extracts via the TypeScript compiler API.

This PRD extends blast-radius coverage from TypeScript files to **JavaScript and TypeScript source files broadly** (`.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`), updates the design docs and user-facing copy to reflect the broader scope, and keeps the same purity boundary and core-shaped analyzer contract. Familiarity analysis is unchanged (already language-agnostic).

**Source designs (to update):** [docs/design/README.md](../docs/design/README.md), [0002-blast-radius-analyzer.md](../docs/design/0002-blast-radius-analyzer.md), [0003-evidence-report-and-cli.md](../docs/design/0003-evidence-report-and-cli.md)

**Current implementation gaps:**
- `importGraphSource.ts` only walks and parses `.ts`/`.tsx` files; alias resolution rejects resolved `.js`/`.jsx` paths
- `blastRadius.ts` and `buildEvidenceReport.ts` gate analysis on TypeScript extensions only
- Report copy and limitations say "TypeScript static imports only"

## Goals

- Include JavaScript source files in the import graph and blast-radius analysis using the same static-import model as today
- Preserve the existing pure-analyzer / impure-inputs architecture and characterization thresholds
- Update design docs and README so documentation matches behavior
- Keep report honesty: still direct importers only, no `require()`, no transitive reach
- Maintain or improve test coverage with JS/JSX fixtures alongside existing TS tests

## Assumptions (documented for implementers)

| Decision | Assumption |
|----------|------------|
| File extensions in scope | `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts` |
| Import syntax | ESM `import` / `export … from` and `import()` (already parsed); **not** CommonJS `require()` |
| Parser | Continue using the `typescript` compiler API with appropriate `ScriptKind` per extension |
| Path resolution | Reuse existing relative + `tsconfig.json`/`jsconfig.json` alias resolution; extend candidates to include `.mjs`/`.cjs` index files where applicable |
| Non-source files | Markdown, JSON, CSS, etc. remain in "not analyzed for blast radius" |

## User Stories

### US-001: Update design docs for JS/TS blast radius
**Description:** As a developer or future agent, I want the LLD set to describe JavaScript-and-TypeScript blast-radius scope so implementation and docs stay aligned.

**Acceptance Criteria:**
- [ ] `docs/design/README.md` scope section describes blast radius as JS/TS (not TypeScript-only); "multi-language" non-goal still excludes Python, Go, etc.
- [ ] `docs/design/0002-blast-radius-analyzer.md` updated: purpose, "how it analyzes", slices, out-of-scope, and dependencies refer to JS/TS source files
- [ ] `docs/design/0003-evidence-report-and-cli.md` updated: `importGraphSource` description and out-of-scope wording reflect JS/TS coverage
- [ ] No contradictory "TypeScript-only" statements remain in the design set unless explicitly marked as historical

### US-002: Discover and parse JavaScript source files in the import graph
**Description:** As a developer, I need the import graph to include `.js`, `.jsx`, `.mjs`, and `.cjs` files so reverse-dependency counts reflect real JavaScript modules.

**Acceptance Criteria:**
- [ ] `importGraphSource.ts` walks repo for all in-scope JS/TS extensions (not only `.ts`/`.tsx`)
- [ ] `extractImportSpecifiers` uses correct `ts.ScriptKind` per file (e.g. `JS`, `JSX`, `TS`, `TSX`, `JSON` for `.json` if ever needed — only JS/TS variants required here)
- [ ] Relative module resolution finds `.js`/`.jsx`/`.mjs`/`.cjs` targets and `index.*` variants under those extensions
- [ ] Aliased module resolution accepts resolved paths for all in-scope JS/TS extensions (remove `.tsx?$`-only filter on resolved paths)
- [ ] Existing TypeScript import-graph tests still pass
- [ ] New unit tests cover at least: `.js` importing `.js`, `.jsx` importing `.jsx`, and a mixed `.ts` → `.js` import chain
- [ ] Typecheck passes

### US-003: Extend blast-radius analyzer to JS/TS changed files
**Description:** As a senior engineer reading the report, I want blast-radius findings for changed JavaScript files, not only `.ts`/`.tsx`.

**Acceptance Criteria:**
- [ ] `blastRadius.ts` treats all in-scope JS/TS extensions as analyzable (rename helper from TypeScript-specific naming to something accurate, e.g. `isAnalyzableSourceFile`)
- [ ] `analyzeBlastRadius` returns findings for changed `.js`/`.jsx`/`.mjs`/`.cjs` files when present in the import graph
- [ ] Changed files outside in-scope extensions are still skipped (not errored)
- [ ] Characterization thresholds unchanged (isolated 0–2, moderate 3–10, broad 11+)
- [ ] Tests updated: "skips non-TypeScript" becomes "skips non-analyzable" with cases for `.md`, `.json`, etc.
- [ ] Typecheck passes

### US-004: Update report assembly and rendering copy
**Description:** As a user, I want report wording to accurately describe JS/TS blast-radius coverage and list only truly unanalyzed files under "not analyzed".

**Acceptance Criteria:**
- [ ] `buildEvidenceReport.ts` classifies in-scope JS/TS files as blast-radius analyzable; only non-source files appear in `notAnalyzedForBlastRadius`
- [ ] Limitations text updated from "TypeScript static imports only" to language-accurate wording (e.g. "JavaScript/TypeScript static imports only; CommonJS require() not analyzed")
- [ ] `renderReport.ts` section headers and empty-state messages use JS/TS wording, not TypeScript-only
- [ ] Tests in `buildEvidenceReport.test.ts`, `renderReport.test.ts`, and `cli.test.ts` updated for new copy and behavior
- [ ] A changed `.js` file with importers no longer appears under "not analyzed for blast radius"
- [ ] Typecheck passes

### US-005: Update project README and validation notes
**Description:** As a new contributor, I want top-level docs to describe the broader blast-radius scope.

**Acceptance Criteria:**
- [ ] Root `README.md` blast-radius bullet describes JS/TS static import analysis
- [ ] `evidence-demo/VALIDATION.md` limitations section updated if it references TypeScript-only blast radius
- [ ] Any "non-TypeScript" limitation bullets in README narrowed to "non-JS/TS source files" where appropriate
- [ ] Typecheck passes

### US-006: End-to-end verification with a JavaScript fixture
**Description:** As the team validating the experiment, I want an integration test proving the full CLI loop works when the changed file is JavaScript.

**Acceptance Criteria:**
- [ ] CLI integration test (or extended fixture repo) includes a PR-like change to a `.js` file imported by other `.js`/`.jsx` modules
- [ ] Report output shows blast-radius finding for the changed `.js` file with correct dependent count
- [ ] Report does not list that `.js` file under "not analyzed for blast radius"
- [ ] `npm test` passes in `evidence-demo/`

## Functional Requirements

### Documentation
- FR-1: Design docs (`docs/design/README.md`, `0002`, `0003`) must describe blast-radius scope as JavaScript and TypeScript source files with static ESM imports
- FR-2: User-facing README and validation docs must match the implemented scope

### Import graph (`importGraphSource.ts`)
- FR-3: The import graph must include all repo source files with extensions: `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`
- FR-4: Static import extraction must use the TypeScript compiler API with extension-appropriate `ScriptKind`
- FR-5: Module resolution must resolve relative and aliased imports to any in-scope JS/TS extension
- FR-6: Resolution must continue to skip `node_modules`, `dist`, and other existing excluded directories
- FR-7: `jsconfig.json` path aliases must be supported the same as `tsconfig.json` (already partially implemented; verify with JS fixtures)

### Blast-radius analyzer
- FR-8: The analyzer must produce findings for changed files with any in-scope JS/TS extension
- FR-9: The analyzer must skip changed files that are not JS/TS source (e.g. `.md`, `.json`, `.css`, `.yaml`)
- FR-10: Existing characterization thresholds and direct-importer-only semantics are unchanged

### Report
- FR-11: Report limitations must state JS/TS static import scope and explicitly note that CommonJS `require()` is not analyzed
- FR-12: The "not analyzed for blast radius" section must list only changed files outside JS/TS source extensions
- FR-13: Familiarity analysis continues to run for all changed files regardless of language

### Architecture (unchanged)
- FR-14: Analyzers remain pure; file walking and parsing remain in `inputs/importGraphSource.ts`
- FR-15: No new dependencies required unless a blocker is discovered; prefer `typescript` API for JS parsing

## Non-Goals

- **CommonJS `require()` / `module.exports`** — static `require()` is not in scope; report should say so
- **Other languages** — Python, Go, Ruby, etc. remain out of scope ("multi-language" deferred)
- **Vue/Svelte/Astro SFCs** — no special handling for imports inside single-file components
- **Dynamic import behavior changes** — `import()` is already extracted where parseable; no new dynamic-import semantics
- **Transitive blast radius** — still direct importers only
- **Changing familiarity analyzer** — already language-agnostic; no changes unless a bug is found
- **Re-running full Peter validation** — optional follow-up; not required to mark this PRD complete
- **CLI flags or configurability** — extension list is fixed in code

## Design Considerations

### Naming
Avoid misleading `TypeScript`-only names in code where behavior now covers JS+TS. Prefer neutral terms:
- `collectSourceFiles` / `isAnalyzableSourceFile` / `JS_TS_EXTENSIONS`
- Keep `importGraphSource.ts` filename (still accurate) unless a rename is trivial and low-risk

### Parser choice
The TypeScript compiler API already parses JavaScript and JSX. Example mapping:

| Extension | ScriptKind |
|-----------|------------|
| `.ts`, `.mts`, `.cts` | `TS` |
| `.tsx` | `TSX` |
| `.js`, `.mjs`, `.cjs` | `JS` |
| `.jsx` | `JSX` |

### Report copy guidance
Replace phrases like:
- "TypeScript static imports only" → "JavaScript/TypeScript static imports only"
- "no TypeScript changed files" → "no JavaScript/TypeScript source files changed"
- "not analyzed (TypeScript-only)" → "not analyzed (not a JS/TS source file)"

Keep the honesty about `require()`, dynamic imports, and transitive reach.

### Test fixtures
Extend `evidence-demo/test/fixtures/` (or inline test repos) with a minimal JS graph:

```
src/
  util.js      ← changed file
  a.js         ← imports ./util.js
  b.jsx        ← imports ./util.js
  isolated.js  ← no importers
```

## Technical Considerations

- **Partial implementation today:** `resolveRelativeModule` already tries `.js`/`.jsx` candidates; main gaps are file walking, `ScriptKind`, alias-resolution filter, and downstream gating
- **Mixed repos:** Common in migrations (TS calling JS). Full graph must include both sides of imports
- **`.mjs`/`.cjs`:** Include in extension lists and resolution candidates; add at least one test if fixtures allow
- **Performance:** Walking more files may slow large repos slightly; acceptable for the demo; no optimization required unless regressions are severe
- **Ralph conversion:** After this PRD is approved, convert to `ralph/prd.json` entries for autonomous implementation

## Success Metrics

| Metric | Target |
|--------|--------|
| JS changed files analyzed | Changed `.js`/`.jsx` files receive blast-radius findings when importers exist |
| Doc consistency | Zero stale "TypeScript-only" claims in design docs and README |
| Regression safety | All existing `evidence-demo` tests pass after updates |
| Report accuracy | `.js` files no longer incorrectly listed as "not analyzed" |

## Open Questions

| Question | Proposed default |
|----------|------------------|
| Include CommonJS `require()` in this PR? | **No** — document as limitation; separate story if needed |
| Include `.vue` / SFC imports? | **No** — out of scope |
| Re-validate against a real JavaScript OSS PR? | **Optional** — US-006 fixture test is required; live repo validation is nice-to-have |
| Rename `importGraphSource.ts` to `moduleGraphSource.ts`? | **No** — avoid drive-by renames unless team prefers it |

## Resolved Decisions

| Question | Decision |
|----------|----------|
| Extensions in scope | `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts` |
| Parser | TypeScript compiler API (`typescript` package), extension-based `ScriptKind` |
| `require()` support | Out of scope; call out in limitations |
| Design doc strategy | Update existing LLDs in place; do not add a new numbered design doc unless drift is large |
| Characterization thresholds | Unchanged from evidence-demo PRD (FR-22 in `prd-evidence-demo.md`) |
