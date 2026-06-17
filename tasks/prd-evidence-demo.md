# PRD: Evidence Demo CLI

## Introduction

Build a local command-line tool that, given a cloned repository and a pull request (or a base…head commit range), prints a human-readable evidence report explaining why a change is or is not risky. The demo computes two of five contextual evidence items Peter enumerated: **author-module familiarity** and **reverse-dependency blast radius**.

This is an experiment, not a product. Its single job is to test whether contextual evidence, shown on real pull requests, clears the bar Peter set. The CLI exists because the validation loop is "tune the explanation until a senior engineer accepts it" — a local tool iterates against any repo and any historical PR instantly, with no commit-build-push-trigger cycle and no per-PR CI cost. The GitHub Action remains the product; this is the test rig.

**Source designs:** [docs/design/README.md](../docs/design/README.md), [0001-familiarity-analyzer.md](../docs/design/0001-familiarity-analyzer.md), [0002-blast-radius-analyzer.md](../docs/design/0002-blast-radius-analyzer.md), [0003-evidence-report-and-cli.md](../docs/design/0003-evidence-report-and-cli.md)

## Goals

- Prove the end-to-end loop: local clone in → structured findings out → human-readable report printed to stdout
- Compute author-module familiarity from git history (language-agnostic, core-destined)
- Compute reverse-dependency blast radius from TypeScript static import analysis (TypeScript-only for the demo, core-destined)
- Produce a report that leads with evidence and supporting numbers, not a verdict or score
- Write analyzers as pure, core-shaped functions separable from the throwaway CLI wrapper
- Validate (or refute) the hypothesis that senior engineers trust the explanation on real PRs
- Demonstrate the privacy posture: everything runs locally, nothing is transmitted or stored

## The Acceptance Criterion (Committed in Advance)

**Validated:** Peter (or another senior engineer) reads the evidence report on real pull requests and says, in substance, "yes, that is actually why this PR is or is not risky." The explanation is one they would act on or at least take seriously.

**Refuted:** The report is noise, obvious, or wrong often enough that a senior engineer would not trust it. Familiarity or blast-radius findings do not match an experienced reader's intuition, or the explanation adds nothing over reading the diff.

If refuted, the robustness grind is not worth starting. If validated, the analyzers lift into `@usebrindle/merge-risk-core` and robustness work begins with confidence.

## User Stories

### US-001: Project scaffolding
**Description:** As a developer, I need a TypeScript project structure so analyzers, inputs, and CLI can be built incrementally.

**Acceptance Criteria:**
- [ ] `evidence-demo/` package with TypeScript configured
- [ ] Directory layout matches design: `src/cli.ts`, `src/inputs/`, `src/report/`, analyzer modules
- [ ] `package.json` with a runnable CLI entry point
- [ ] Typecheck passes

### US-002: Resolve PR or commit range to changed files and author
**Description:** As a user, I want to point the CLI at a local repo and a PR or commit range so the tool knows what change to analyze.

**Acceptance Criteria:**
- [ ] `changedFiles.ts` accepts a local repo path and a PR reference (e.g. PR number, branch name) or `base...head` commit range
- [ ] Returns the list of changed file paths for that change
- [ ] Returns the PR author identity (name/email or equivalent from git)
- [ ] Works against a real cloned repository
- [ ] Typecheck passes

### US-003: Git history source (impure edge)
**Description:** As a developer, I need a git-backed history source at the CLI edge so the familiarity analyzer stays pure and testable.

**Acceptance Criteria:**
- [ ] `gitHistorySource.ts` reads git log from a local clone
- [ ] Exposes a query interface the familiarity analyzer consumes (author commits to a path over a time window, last-touch date, total area churn)
- [ ] Configurable history window (default: last 6 months)
- [ ] Typecheck passes

### US-004: Familiarity analyzer — single-file commit count (Slice 1)
**Description:** As a developer, I need to count an author's commits to a single touched file so the git-history-to-finding path is proven end to end.

**Acceptance Criteria:**
- [ ] Pure function: inputs are author identity, touched path, and a history source; no git shell-out inside the analyzer
- [ ] Returns raw commit count for one file over the history window
- [ ] Verified against a real repo's git log
- [ ] Typecheck passes

### US-005: Familiarity analyzer — directory aggregation and recency (Slice 2)
**Description:** As a senior engineer reading the report, I want directory-level familiarity and recency so a touched area produces a fuller picture than a single file count.

**Acceptance Criteria:**
- [ ] Aggregates commit counts at the directory level for each touched area
- [ ] Includes the date of the author's most recent commit to each area
- [ ] Returns structured findings per touched area with supporting counts
- [ ] Typecheck passes

### US-006: Familiarity analyzer — normalization and characterization (Slice 3)
**Description:** As a senior engineer, I want familiarity characterized as high/moderate/none with the numbers behind it so I can judge the label myself.

**Acceptance Criteria:**
- [ ] Computes author's share of total activity in each area (normalized by area churn)
- [ ] Produces per-area characterization: high, moderate, or none, with recency gating (stale history cannot yield high regardless of commit count)
- [ ] Retains all supporting numbers in the finding (author commits, total area commits, recency, share)
- [ ] Typecheck passes

### US-007: Import graph source (impure edge)
**Description:** As a developer, I need a parsed import graph at the CLI edge so the blast-radius analyzer stays pure and testable.

**Acceptance Criteria:**
- [ ] `importGraphSource.ts` parses TypeScript sources in a local clone
- [ ] Builds a map from each module to the modules that import it (reverse-dependency view)
- [ ] Handles relative import specifiers in the common case
- [ ] Typecheck passes

### US-008: Blast-radius analyzer — single-file dependent count (Slice 1)
**Description:** As a developer, I need to count direct importers of one changed TypeScript file so the import-graph-to-finding path is proven end to end.

**Acceptance Criteria:**
- [ ] Pure function: inputs are changed files and an import graph; no file I/O inside the analyzer
- [ ] For one changed file, returns count of direct importers and their paths
- [ ] Verified against a real TypeScript repo
- [ ] Typecheck passes

### US-009: Blast-radius analyzer — characterization and dependents (Slice 2)
**Description:** As a senior engineer, I want each changed file characterized as isolated/moderate/broad with named dependents so the finding is convincing.

**Acceptance Criteria:**
- [ ] Characterizes each changed file as isolated, moderate, or broad based on direct dependent count
- [ ] Includes a sample of dependent module paths in the finding
- [ ] Returns structured blast-radius finding per changed TypeScript file
- [ ] Typecheck passes

### US-010: Blast-radius analyzer — path-aliased imports (Slice 3)
**Description:** As a developer, I need tsconfig path aliases resolved so real repos are not undercounted.

**Acceptance Criteria:**
- [ ] Resolves path-aliased imports (tsconfig `paths`) in addition to relative imports
- [ ] Dependent counts reflect alias-resolved imports in a real repo that uses path aliases
- [ ] Typecheck passes

### US-011: Evidence report assembly (pure)
**Description:** As a senior engineer, I want findings assembled into a structured report that leads with evidence, not a verdict.

**Acceptance Criteria:**
- [ ] `buildEvidenceReport.ts` is a pure function: analyzer findings → structured report object
- [ ] Report includes per-area familiarity with supporting numbers (not just labels)
- [ ] Report includes per-file blast radius with dependent count and named dependents (not just labels)
- [ ] Report states explicit limitations (what is not computed)
- [ ] No risk score or merge recommendation produced
- [ ] Typecheck passes

### US-012: Report rendering (pure)
**Description:** As a user, I want the structured report rendered as readable text printed to stdout.

**Acceptance Criteria:**
- [ ] `renderReport.ts` is a pure function: structured report → formatted text
- [ ] Output is human-readable and suitable for terminal display
- [ ] Familiarity section shows numbers (e.g. "author has 2 commits here in 6 months, last one 4 months ago, versus 180 commits in this area total by others")
- [ ] Blast-radius section shows counts and sample dependents (e.g. "imported by 34 modules, including …")
- [ ] Limitations section is present and honest
- [ ] Non-TypeScript changed files appear in a "not analyzed for blast radius" section with a brief TS-only note; familiarity section still covers them
- [ ] Typecheck passes

### US-013: CLI end-to-end — familiarity only (Slice 1)
**Description:** As a user, I want to run the CLI against a local repo and PR and see a familiarity report so the full loop is proven with one analyzer.

**Acceptance Criteria:**
- [ ] CLI accepts repo path and PR/range arguments
- [ ] Orchestrates: resolve change → run familiarity analyzer → build report → render → print
- [ ] Prints a minimal familiarity report to stdout
- [ ] Nothing transmitted or stored; reads only the local clone
- [ ] Typecheck passes

### US-014: CLI end-to-end — both analyzers (Slice 2)
**Description:** As a user, I want the full evidence report with both familiarity and blast-radius sections.

**Acceptance Criteria:**
- [ ] CLI runs both analyzers and includes both sections in the report
- [ ] Blast-radius section only covers changed TypeScript files; non-TS files are noted or skipped appropriately
- [ ] End-to-end run against a real TypeScript repo with a real PR produces a complete report
- [ ] Typecheck passes

### US-015: Report tuning against real PRs (Slice 3)
**Description:** As the team validating the experiment, I want to iterate report formatting against real PRs until a senior engineer accepts the explanation.

**Acceptance Criteria:**
- [ ] Tool run against several real PRs from known TypeScript repos (Brindle, Peter's/Sean's repos, or similar)
- [ ] Report formatting adjusted based on critical review of output
- [ ] Output shown to Peter (or designated senior engineer) against the pre-committed acceptance criterion
- [ ] Documented result: validated or refuted, with examples

## Functional Requirements

### CLI and inputs
- FR-1: The CLI must accept a path to a local cloned repository and a pull request reference or `base...head` commit range
- FR-2: The CLI must determine changed files and PR author from the local repo via git
- FR-3: The CLI must read only the local clone and write only to stdout; no network calls, no persistence
- FR-4: `changedFiles.ts`, `gitHistorySource.ts`, and `importGraphSource.ts` are impure edge modules owned by the CLI

### Familiarity analyzer (LLD 0001)
- FR-5: The familiarity analyzer must be a pure function taking author identity, touched paths, and a history source
- FR-6: The analyzer must compute, per touched area over a configurable window (default 6 months): author commit count, directory-level aggregation, last-touch recency, and author's share of total area churn
- FR-7: The analyzer must produce per-area findings with characterization (high/moderate/none) and all supporting numbers
- FR-8: The analyzer must not shell out to git, format output, or contain CLI logic

### Blast-radius analyzer (LLD 0002)
- FR-9: The blast-radius analyzer must be a pure function taking changed files and an import graph representation
- FR-10: The analyzer must build a reverse-dependency view: for each changed file, count and list modules that statically import it
- FR-11: The analyzer must characterize each changed file as isolated, moderate, or broad based on direct dependent count
- FR-12: The analyzer must resolve relative imports and tsconfig path-aliased imports
- FR-13: The analyzer must handle TypeScript files only; static `import` statements only (no dynamic imports)
- FR-14: The analyzer must not read files, format output, or contain CLI logic

### Report (LLD 0003)
- FR-15: `buildEvidenceReport.ts` must assemble familiarity and blast-radius findings into a structured report
- FR-16: `renderReport.ts` must render the structured report as human-readable text
- FR-17: The report must lead with evidence and supporting numbers, not a verdict
- FR-18: The report must state what it does not compute (limitations section)
- FR-19: The report must not produce a risk score or merge recommendation
- FR-20: Non-TypeScript changed files must appear in a dedicated "not analyzed for blast radius" section; familiarity analysis still runs for all changed files regardless of language
- FR-21: Familiarity characterization uses recency as a gate, not just commit count — context decays over time. All counts are within the 6-month history window. **High:** last touch within 60 days AND (≥3 author commits OR ≥25% share of area churn). **Moderate:** last touch within 120 days with ≥1 commit but not qualifying for high, OR last touch 121–180 days ago with ≥2 commits (meaningful past work, likely faded context). **None:** 0 commits in window, OR last touch > 120 days ago with only 1 commit, OR last touch > 180 days ago
- FR-22: Blast-radius characterization thresholds: **isolated** = 0–2 direct importers; **moderate** = 3–10; **broad** = 11+
- FR-23: History window is hardcoded to 6 months for the demo (not CLI-configurable in v1)

### Architecture
- FR-24: Analyzers must be written core-shaped so they can lift into `@usebrindle/merge-risk-core` if validated
- FR-25: Report assembly modules (`buildEvidenceReport.ts`, `renderReport.ts`) are pure and plausibly core-destined
- FR-26: The CLI wrapper (`cli.ts`) and `inputs/` modules are throwaway and replaced when analyzers move to core

## Non-Goals

### Product features deferred if demo validates
- Renamed and moved files (git history breaks across renames)
- Squashed commits, bot commits, co-authored commits (authorship mis-attribution)
- Reviewers who shaped code but rarely commit
- New team members (no history ≠ low familiarity distinction)
- Monorepo package boundaries and cross-package resolution
- Dynamic imports
- Transitive dependency impact (direct importers only)
- Generated code handling
- Multi-language blast radius
- Public-interface and API-surface analysis as a distinct signal
- Config or schema files whose impact is not expressed through imports

### Evidence items not in this demo
- Public-interface touches
- Resemblance to past clean merges
- Resemblance to past reverts and incidents

### Infrastructure and product
- Risk scoring or merge recommendations
- Any persistence or storage
- Any hosting or remote execution
- GitHub Action integration (the Action is the product; this CLI is the test rig)
- Polished UX beyond readable terminal output

## Design Considerations

### Report design principles
- Show the numbers, not just the label — a senior engineer trusts "2 commits in 6 months, last one 4 months ago, versus 180 by others" over "familiarity: low"
- Name concrete dependents — "imported by 34 modules, including X, Y, Z" over "blast radius: broad"
- State limitations explicitly — "direct importers only, transitive not yet computed" builds credibility
- No verdict — the report explains; the reader judges

### Familiarity and recency
Familiarity is not lifetime ownership. All git signals are computed within the 6-month history window, and **recency gates the label**: an author with many commits but no touch in months has lost context and must not be rated high. The report always shows last-touch date alongside counts so the reader can verify the characterization. Thresholds are tunable constants; see FR-21.
Changed files that are not TypeScript still appear in the report. Familiarity runs for all changed files. Blast-radius analysis is skipped for non-TS files and they are grouped under a short section such as "Blast radius: not analyzed" with a one-line note that only TypeScript static imports are supported. This keeps the full change visible without implying a blast-radius finding where none was computed.

### Component layout
```
evidence-demo/
  src/
    cli.ts                  # arg parsing, orchestration (throwaway)
    inputs/
      gitHistorySource.ts   # impure: git log from local clone
      importGraphSource.ts  # impure: parse TS imports from local clone
      changedFiles.ts       # impure: PR/range → changed files + author
    report/
      buildEvidenceReport.ts # pure: findings → structured report
      renderReport.ts        # pure: structured report → text
    analyzers/
      familiarity.ts         # pure (core-destined)
      blastRadius.ts         # pure (core-destined)
```

### Build order
1. Familiarity analyzer (language-agnostic, simpler) — proves the loop fastest
2. Blast-radius analyzer (TypeScript-specific)
3. Report formatting — where tuning against Peter's bar happens

## Technical Considerations

- **Language:** TypeScript throughout; blast-radius analysis is TypeScript-only for the demo
- **Purity boundary:** Analyzers and report modules are pure; impure git/file access lives in `inputs/` at the CLI edge
- **History window:** Hardcoded to 6 months for the demo; not CLI-configurable in v1
- **Characterization thresholds:** See FR-21 and FR-22; tunable constants in analyzer code, adjusted during Slice 3 if real PR output feels miscalibrated
- **Import parsing:** Use existing TypeScript tooling (e.g. `typescript` compiler API or a lightweight parser) for static import extraction
- **Path resolution:** Must read `tsconfig.json` paths for alias resolution in real repos
- **Testing:** Pure analyzer functions are unit-testable with mock history sources and import graphs; integration tests run against real cloned repos
- **Future lift:** If validated, analyzers move to `@usebrindle/merge-risk-core`; only the thin CLI wrapper is discarded

## Success Metrics

| Metric | Target |
|--------|--------|
| Senior engineer acceptance | Peter (or designated reviewer) says "yes, that is actually why this PR is or is not risky" on real PRs |
| Explanation trustworthiness | Findings match an experienced reader's intuition more often than not |
| Added value over diff | Explanation adds signal beyond reading the diff alone |
| Privacy posture | Zero data leaves the machine; demonstrated, not asserted |
| Iteration speed | Report tuning loop completes in minutes per PR, not hours (no CI cycle) |

**Go/no-go:** If validated → begin robustness work and lift analyzers to core. If refuted → do not start the robustness grind.

## Resolved Decisions

| Question | Decision |
|----------|----------|
| Which repos/PRs for validation? | Out of scope for this PRD — handled outside the build |
| Familiarity thresholds (high/moderate/none) | Recency-gated, all within 6-month window. **High:** last touch ≤60 days AND (≥3 commits OR ≥25% share). **Moderate:** last touch ≤120 days with ≥1 commit (not high), OR last touch 121–180 days with ≥2 commits. **None:** 0 commits, OR stale single commit (>120 days), OR last touch >180 days |
| Blast-radius thresholds (isolated/moderate/broad) | **Isolated:** 0–2 direct importers. **Moderate:** 3–10. **Broad:** 11+ |
| Non-TypeScript changed files | Listed in a "not analyzed for blast radius" section; familiarity still computed; one-line note explaining TS-only scope |
| History window configurability | Hardcoded to 6 months in v1; no CLI flag |
