# PRD: CommonJS Require Support and Per-File Familiarity

## Introduction

Two gaps block the evidence-demo from matching the current design and user expectations on real pull requests.

**Gap 1 — Blast radius vs. updated LLD 0002:** [docs/design/0002-blast-radius-analyzer.md](../docs/design/0002-blast-radius-analyzer.md) now specifies that blast-radius analysis must include **static-literal CommonJS `require()`** calls alongside ESM static imports. The current implementation only extracts ESM `import` / `export … from` relationships. On enterprise JavaScript repos (including SFCC), many modules are wired with `require()`, so the report undercounts dependents and lists misleading limitations such as "CommonJS require() is not analyzed."

**Gap 2 — Familiarity shows directories, not changed files:** The Familiarity section labels each finding with the **containing directory** (e.g. `cartridges/int_amplience/cartridge/css/carousels/`) because `analyzeFamiliarity` aggregates git history at directory level via `touchedAreaForPath()`. Blast Radius already lists **each changed file** by full path. A senior engineer reading the report expects the same per-file alignment in Familiarity — one line per changed file with that file's path, not its parent folder.

**Example of the bug (from PR-3807 on `cnvcam_digital_sfcc`):**

```
Changed files (3):
  cartridges/.../product-carousel.css
  cartridges/.../product-carousel-strip.js
  cartridges/.../amplienceProductCarouselTransformer.js

Familiarity
-----------
  cartridges/int_amplience/cartridge/css/carousels/ — high    ← directory, not product-carousel.css
  cartridges/int_amplience/cartridge/js/carousels/ — high     ← directory, not product-carousel-strip.js
  cartridges/int_amplience/cartridge/scripts/transformers/ — high
```

Expected: each Familiarity line uses the **same file path** as in Changed files and Blast Radius.

**Source designs:** [0001-familiarity-analyzer.md](../docs/design/0001-familiarity-analyzer.md), [0002-blast-radius-analyzer.md](../docs/design/0002-blast-radius-analyzer.md), [0003-evidence-report-and-cli.md](../docs/design/0003-evidence-report-and-cli.md), [README.md](../docs/design/README.md)

## Goals

- Implement static-literal `require()` extraction and fold require-based edges into the same reverse-dependency map as ESM imports
- Update report limitations and section copy so they accurately describe what is and is not counted (static `import` + static-literal `require()`; dynamic require still excluded)
- Change familiarity analysis and report output to **one finding per changed file**, labeled by full file path
- Keep analyzers pure, characterization thresholds unchanged, and architecture (inputs at edge, analyzers in `src/analyzers/`) intact
- Add tests and fixtures proving both gaps are closed, including a `require()`-based dependent chain

## Assumptions (documented for implementers)

| Decision | Assumption |
|----------|------------|
| Familiarity granularity | **Per changed file**, not per directory. Git queries use the exact file path. Share-of-churn is author commits to that file ÷ total commits to that file in the 6-month window. |
| Multiple files, same directory | Each changed file gets its own finding and line in the report (no deduplication by directory). |
| `require()` in scope | Only calls where the argument is a **static string literal** (`require('./foo')`, including assigned and nested-in-function forms). |
| `require()` out of scope | Dynamic specifiers (`require(variable)`, `require('./' + name)`, template literals with expressions). No expression evaluation. |
| Characterization thresholds | Familiarity (high/moderate/none) and blast radius (isolated/moderate/broad) thresholds unchanged from current implementation. |
| Familiarity field names | Rename `area` → `touchedFile`, `totalAreaCommitCount` → `totalFileCommitCount`, `shareOfAreaChurn` → `shareOfFileChurn`. File is the unit; names must say file. |
| Directory context in report | **None.** No secondary directory line or "commits in this directory" detail. File-level facts are unimpeachable; directory is an unreliable proxy (folders are not reliably modules) and would reintroduce ambiguity next to the most-trusted signal. |
| Design doc updates | Update 0001 (familiarity per-file), 0003, and README in addition to confirming 0002 is already current. |
| Live repo validation | Out of scope for implementation stories. Human validation on real repos (e.g. `cnvcam_digital_sfcc` PR-3807) is handled separately by the team. |

## User Stories

### US-001: Extract static-literal require() in the import graph
**Description:** As a developer, I need the import graph to record reverse-dependency edges from static `require()` calls so blast radius reflects how CommonJS modules are actually wired.

**Acceptance Criteria:**
- [ ] `importGraphSource.ts` walks `CallExpression` nodes where the callee is `require` and the argument is a `StringLiteral` (or equivalent static form)
- [ ] Extracted require specifiers are resolved with the same relative and tsconfig/jsconfig alias resolution as ESM imports
- [ ] Require-based edges are merged into the same `ImportGraph` map (target → sorted importer paths)
- [ ] `require(someVariable)` and other non-literal forms produce **no** edge
- [ ] Unit tests cover: `.js` file required by another `.js` file; mixed `import` + `require` dependents on the same target; dynamic `require(variable)` produces no false edge
- [ ] Existing import-graph and blast-radius tests still pass
- [ ] Typecheck passes

### US-002: Blast-radius findings include require-based dependents
**Description:** As a senior engineer reading the report, I want dependent counts to include modules that reach a changed file via `require()`, not only via `import`.

**Acceptance Criteria:**
- [ ] `analyzeBlastRadius` / `countDirectImportersForFile` return dependents regardless of whether the edge came from `import` or `require()`
- [ ] A changed file required by other modules shows a non-zero `dependentCount` and lists those dependents in the sample
- [ ] Characterization thresholds unchanged (isolated 0–2, moderate 3–10, broad 11+)
- [ ] Integration or CLI test includes a fixture where the only dependents use `require()`, and the report shows them
- [ ] Typecheck passes

### US-003: Update report copy and limitations for require() support
**Description:** As a user, I want report wording to state exactly what blast-radius analysis counts now that `require()` is supported.

**Acceptance Criteria:**
- [ ] `buildEvidenceReport.ts` limitations updated: state **static `import` and static-literal `require()`** dependents; dynamic `require()` and runtime indirection not counted
- [ ] `renderReport.ts` "Not Analyzed for Blast Radius" preamble no longer says "CommonJS require() is not analyzed"
- [ ] Blast Radius section context line mentions both import and require mechanisms (or neutral "static dependency" wording)
- [ ] `renderReport.test.ts`, `buildEvidenceReport.test.ts`, and `cli.test.ts` updated for new copy
- [ ] On platforms with non-import/require wiring (e.g. SFCC cartridge path), limitations note blast radius may be a **lower bound** (per LLD 0002)
- [ ] Typecheck passes

### US-004: Familiarity analyzer produces per-file findings
**Description:** As a developer, I need familiarity analysis to query git history per changed file so findings align with the changed-files list.

**Acceptance Criteria:**
- [ ] `analyzeFamiliarity` iterates over **unique changed file paths** (not `touchedAreaForPath()` directories)
- [ ] Each finding corresponds to one changed file; git `historySource.query()` uses the file path as `path`
- [ ] `FamiliarityFinding` fields renamed: `area` → `touchedFile`, `totalAreaCommitCount` → `totalFileCommitCount`, `shareOfAreaChurn` → `shareOfFileChurn`
- [ ] `shareOfFileChurn` computed from file-level counts (author file commits ÷ total file commits)
- [ ] `characterizeFamiliarity` thresholds unchanged; recency based on author's last touch to **that file**
- [ ] `touchedAreaForPath` removed (no remaining callers); no directory aggregation in `analyzeFamiliarity`
- [ ] Familiarity tests updated: findings use file paths like `src/foo.ts`, not `src/`
- [ ] Typecheck passes

### US-005: Familiarity report renders one line per changed file
**Description:** As a senior engineer reading a real PR report, I want each Familiarity line to show the actual changed file path, matching Changed files and Blast Radius.

**Acceptance Criteria:**
- [ ] `renderReport.ts` Familiarity section labels each finding with the **full file path** (same string as in `changedFiles`)
- [ ] Section context line updated from "each touched area" to "each changed file" (or equivalent)
- [ ] Detail text uses file-scoped language only ("commits to this file"); no directory context, secondary labels, or "in this area" phrasing
- [ ] Sort order preserved: unfamiliar (none) first, then moderate, then high; tie-break by file path
- [ ] For the PR-3807-style example, Familiarity lines include `product-carousel.css`, `product-carousel-strip.js`, and `amplienceProductCarouselTransformer.js` — not parent directories
- [ ] `renderReport.test.ts` and `cli.test.ts` assert file-path labels
- [ ] Typecheck passes

### US-006: Update design docs for per-file familiarity and require() blast radius
**Description:** As a future agent or developer, I want the LLD set to match implemented behavior.

**Acceptance Criteria:**
- [ ] `docs/design/0001-familiarity-analyzer.md` updated: output is per touched **file**; git queries at file path; share and characterization at file level; directory aggregation removed from contract
- [ ] `docs/design/0002-blast-radius-analyzer.md` confirmed consistent (already describes require); no stale ESM-only wording
- [ ] `docs/design/0003-evidence-report-and-cli.md` updated: familiarity section describes per-file lines; import graph description mentions require extraction
- [ ] `docs/design/README.md` scope mentions static import **and** static-literal require for blast radius
- [ ] Root `README.md` and `evidence-demo/VALIDATION.md` updated if they still claim require is unsupported or familiarity is directory-scoped

### US-007: End-to-end validation on realistic fixtures
**Description:** As the team validating the experiment, I want integration tests that mirror real PR output structure.

**Acceptance Criteria:**
- [ ] CLI or integration test fixture includes a changed `.js` file depended on only via `require()`; report shows blast-radius finding with dependents
- [ ] CLI or integration test fixture includes multiple changed files in the same directory; Familiarity shows **separate lines per file** with distinct counts where git history differs
- [ ] `npm run typecheck`, `npm run test`, and `npm run build` pass in `evidence-demo/`

## Functional Requirements

### CommonJS require() (blast radius)

- FR-1: The import graph must extract static-literal `require()` calls from all in-scope JS/TS source files
- FR-2: Require-based dependencies must use the same module resolution as ESM imports (relative paths, extension candidates, index files, tsconfig/jsconfig paths)
- FR-3: Dynamic or computed require specifiers must not create graph edges
- FR-4: The reverse-dependency map must not distinguish edge type; analyzers count all direct importers regardless of import vs require
- FR-5: Report limitations must state: direct static import and static-literal require dependents only; dynamic require and transitive reach excluded

### Per-file familiarity

- FR-6: Familiarity analysis must produce exactly one finding per unique path in the changed-files list
- FR-7: Git history queries for familiarity must use the file path, not the parent directory
- FR-8: Share-of-churn for familiarity must be computed from file-level commit counts
- FR-9: Report Familiarity section must display the full file path as the primary label for each finding
- FR-10: Familiarity continues to run for all changed files regardless of language (CSS, JSON, etc. remain in scope for familiarity)

### Architecture (unchanged)

- FR-11: Analyzers remain pure; git and graph I/O remain in `src/inputs/`
- FR-12: No new npm dependencies unless the TypeScript AST cannot represent require calls (unlikely)
- FR-13: Characterization thresholds for familiarity and blast radius are unchanged

## Non-Goals

- **Dynamic `require()`** — `require(variable)`, concatenated paths, template expressions; report states omission honestly
- **Platform-specific module resolution** — SFCC cartridge path, template includes, etc.; note as lower bound only
- **Transitive blast radius** — still direct dependents only
- **Directory-level familiarity aggregation** — removed from demo behavior; do not show parent directory as the primary label or as secondary context
- **Directory as supplementary Familiarity signal** — folders are not reliably modules; directory commit counts are often a wrong signal beside file-level facts; do not surface them
- **Familiarity for "areas" the PR did not touch** — only changed files get findings
- **Changing the 6-month history window** — remains fixed
- **Risk score or merge recommendation** — still out of scope
- **Re-running full Peter validation campaign** — optional follow-up, not required for PRD completion

## Design Considerations

### Familiarity: why per-file

Directory aggregation made sense for Slice 2 prototyping but breaks report alignment. When a PR touches `product-carousel-strip.js` and `product-carousel.css` in the same folder, a single directory line hides which file the author actually touched. Blast Radius already uses per-file lines; Familiarity should match.

`countAuthorCommitsToFile` (Slice 1) already queries at file level. US-004 largely wires Slice 2/3 characterization to file paths instead of `touchedAreaForPath()` directories.

### Familiarity: no directory context

Do not add secondary directory context in the report. The virtue of file-level familiarity is that the claim is unambiguous and verifiable: "author has N commits to **this file**." Directory is an unreliable proxy for "area" because folders are not reliably modules — a directory may hold unrelated files, generated assets, or code the author never touched. Surfacing "commits in this directory" next to file-level numbers would present an often-wrong signal beside the most-trusted one and reintroduce exactly the ambiguity the per-file change is meant to escape.

### Naming: file is the unit

Rename `area` → `touchedFile`, `totalAreaCommitCount` → `totalFileCommitCount`, `shareOfAreaChurn` → `shareOfFileChurn`. After this change the code operates on files, not areas; leaving "area" in names would mislead the next reader (human, agent, or future self).

### Require(): credibility line

Per LLD 0002, stating "static import and literal require dependents only" is preferable to silent undercounting. After this PRD, the "Not Analyzed" section should only list changed files that are genuinely outside JS/TS source analysis (e.g. `.css`), not files missed because dependents use `require()`.

### Report copy alignment

| Section | Primary label |
|---------|----------------|
| Changed files | full path |
| Familiarity | full path (per changed file) |
| Blast Radius | full path (per analyzable JS/TS changed file) |
| Not Analyzed | full path (non-JS/TS changed files) |

### Example expected output (Familiarity excerpt)

```
Familiarity
-----------
  How much the author has worked on each changed file over the last 6 months.
  cartridges/int_amplience/cartridge/css/carousels/product-carousel.css — high
    Author has 2 commits to this file in 6 months (40% of file churn), last touch today; ...
  cartridges/int_amplience/cartridge/js/carousels/product-carousel-strip.js — high
    Author has 4 commits to this file in 6 months (44.4% of file churn), last touch today; ...
```

## Technical Considerations

- **AST extraction:** Use `typescript` `CallExpression` with `expression` identifier `require` and `arguments[0]` as `StringLiteral`. Handle `require('./foo')` assigned to variables and nested in blocks.
- **Existing helper:** `countAuthorCommitsToFile` in `familiarity.ts` is the file-level query pattern; extend `analyzeFamiliarity` to use it (or equivalent inline query) per path.
- **Breaking type change:** Rename `FamiliarityFinding.area` → `touchedFile`, `totalAreaCommitCount` → `totalFileCommitCount`, `shareOfAreaChurn` → `shareOfFileChurn` (and rename `shareOfAreaChurn()` helper to `shareOfFileChurn()` if it remains exported). Update `buildEvidenceReport`, `renderReport`, and all familiarity tests in one story.
- **Git path filter:** `git log -- <file>` already scopes to that file; directory-wide commits no longer inflate familiarity for unrelated files in the same folder.
- **Performance:** Per-file git queries mean N queries for N changed files (typically small on PRs); acceptable for demo.
- **Ralph conversion:** After approval, convert to `ralph/prd.json` entries for autonomous implementation.

## Success Metrics

| Metric | Target |
|--------|--------|
| Require dependents counted | Changed file with only `require()` importers shows correct dependent count in report |
| Limitations accuracy | No report text claims require is unsupported |
| Familiarity file alignment | Every Familiarity line label matches a path from Changed files |
| Familiarity file alignment | Every Familiarity line label matches a path from Changed files; no directory paths as labels |
| Regression safety | All `evidence-demo` tests pass |

## Open Questions

| Question | Proposed default |
|----------|------------------|
| `require()` inside `createRequire` or indirect calls? | **Out of scope** — only direct `require('literal')` call form |

## Resolved Decisions

| Question | Decision |
|----------|----------|
| Familiarity granularity | Per changed file, full path as label |
| Field renames | `area` → `touchedFile`; `totalAreaCommitCount` → `totalFileCommitCount`; `shareOfAreaChurn` → `shareOfFileChurn` |
| Directory context in report | **None** — file-level fact is unimpeachable; directory is an unreliable proxy and must not appear as primary or secondary context |
| `touchedAreaForPath` | Remove when unused after US-004 |
| Require scope | Static string literal only |
| Design doc strategy | Update 0001, 0003, README; 0002 already updated |
| Blast-radius thresholds | Unchanged |
| Familiarity thresholds | Unchanged |
| Live repo validation (e.g. PR-3807) | Out of scope for implementation; handled by the team separately |
