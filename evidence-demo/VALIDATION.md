# Evidence Demo — Real PR Validation (US-015)

**Date:** 2026-06-17  
**Result:** **Validated** (with documented caveats)  
**Reviewer stance:** Senior engineer acceptance test — "Does this explain why the PR is or is not risky, with evidence I can verify?"

## Repos and PRs exercised

| Repo | PR | Author context | Changed files | Notes |
|------|-----|----------------|---------------|-------|
| [colinhacks/zod](https://github.com/colinhacks/zod) | 6098 | First-time contributor (0 commits on changed files) | 3 TS files in `packages/zod/src/v4/` | Core schema + test file |
| [colinhacks/zod](https://github.com/colinhacks/zod) | 6096 | (similar external contributor pattern) | TS in v4 classic/core | Confirms unfamiliar-author signal is stable |
| [sindresorhus/type-fest](https://github.com/sindresorhus/type-fest) | 1461 | External contributor | 2 TS files (`source/`, `test-d/`) | Small utility type addition |
| [sindresorhus/type-fest](https://github.com/sindresorhus/type-fest) | 1460 | External contributor | TS in `source/` | Repeatable unfamiliar-file pattern |
| [unjs/citty](https://github.com/unjs/citty) | 243 | renovate[bot] dependency bump | `package.json`, `pnpm-lock.yaml` | Non-TS-only change |
| brindle/v2 (local) | recent commit range | Sole contributor, active work | 7 files across `evidence-demo/`, `ralph/` | Dogfood on the tool's own repo |

Re-run anytime:

```bash
cd evidence-demo
npm run build
./scripts/run-validation-prs.sh
```

## Formatting changes from critical review

After reading raw output from the PRs above, these report-format adjustments were made:

1. **Line-first familiarity phrasing** — When the file has blameable lines, detail leads with current line ownership and windowed line churn, then commit counts and recency in parentheses. Example: "Author owns 62% of current lines and 41% of line churn in 6 months (3 commits, last touch 10 days ago; 7 commits by others in window)." When blameable lines are zero (binary, empty, or non-text), the report falls back to commit-only phrasing with "commit activity" for commit-share, not line ownership.

2. **No-author-history cases** — When the author has no commits in the window: with blameable lines, lead with line ownership (often 0%) and state "(no author commits in window; N commits by others in window)"; without blameable lines, use "No author commits to this file in 6 months; N commits by others in this window."

3. **Sole contributor with blameable lines** — Line ownership lead plus commit facts, e.g. "Author owns 100% of current lines in 6 months (2 commits, last touch today)."

4. **Shared file with blameable lines** — Line ownership lead, author commit count and recency, then others' commit activity in the same parenthetical.

5. **Per-file familiarity labels** — Each Familiarity line shows the full changed file path (for example `packages/zod/src/v4/classic/schemas.ts`), not a parent directory. Multiple files in the same directory get separate lines with distinct counts where git history differs.

6. **Repository root label** — File path `.` (from root-level files like `package.json`) now renders as `(repository root)` instead of a bare dot.

7. **Changed-file listing** — Header now lists changed paths (truncated at 12) so the reader sees the diff scope without re-running git.

8. **Change reference** — Report header includes the PR number or commit range analyzed.

9. **Section context lines** — Brief one-line descriptions under Familiarity and Blast Radius headers explain what each section measures (per changed file for familiarity; static import and require() reach for blast radius, with transitive reach as the characterization signal).

10. **Priority ordering** — Unfamiliar files (`none`) appear before familiar ones; broad blast-radius findings appear before isolated ones.

## Example outputs (post-tuning)

### External contributor, unfamiliar files (zod #6098)

```
Familiarity
-----------
  How much the author has worked on each changed file over the last 6 months.
  packages/zod/src/v4/classic/schemas.ts — none
    Author owns 0% of current lines and 0% of line churn in 6 months (no author commits in window; 42 commits by others in window).
  packages/zod/src/v4/classic/tests/schemas.test.ts — none
    Author owns 0% of current lines and 0% of line churn in 6 months (no author commits in window; 38 commits by others in window).
  packages/zod/src/v4/core/schemas.ts — none
    Author owns 0% of current lines and 0% of line churn in 6 months (no author commits in window; 45 commits by others in window).
```

**Senior engineer read:** Trustworthy. The author has no recent history on the changed v4 files despite substantial team activity there — a legitimate unfamiliarity signal. Numbers are verifiable via `git log`.

### Dependency-only PR (citty #243)

```
Changed files (2):
  package.json
  pnpm-lock.yaml

Familiarity
-----------
  package.json — none
    No author commits to this file in 6 months; 12 commits by others in this window.

Not Analyzed for Blast Radius
-----------------------------
  Blast-radius analysis covers JavaScript/TypeScript source files only.
  package.json
  pnpm-lock.yaml
```

**Senior engineer read:** Honest scope. Familiarity on a bot dependency bump is weak signal (bot identity), but the report correctly states JS/TS blast radius was not computed for non-source files and does not overclaim.

### Active sole contributor (brindle/v2 dogfood)

```
  evidence-demo/src/report/renderReport.ts — high
    Author owns 100% of current lines and 100% of line churn in 6 months (2 commits, last touch today).
  evidence-demo/test/renderReport.test.ts — high
    Author owns 100% of current lines and 100% of line churn in 6 months (13 commits, last touch today).
```

Each changed file gets its own Familiarity line with file-scoped line ownership and commit counts, even when multiple files share a parent directory.

## Acceptance criterion assessment

| Criterion | Assessment |
|-----------|------------|
| Findings match experienced reader intuition | **Yes** for familiarity on real PRs — external contributors show `none`, active maintainers show `high`/`moderate` with plausible counts |
| Explanation adds signal beyond the diff | **Yes** — churn totals and recency per file quantify risk the diff alone does not show |
| Numbers, not just labels | **Yes** — every characterization is backed by line ownership and windowed line churn when blameable, plus commit counts, recency, and commit-share where applicable |
| Named dependents where applicable | **Yes** — type-fest #1461 correctly names `index.d.ts` as sole dependent; static-literal `require()` dependents are included; transitive reach drives characterization with direct importers shown as evidence when counts diverge |
| Honest limitations | **Yes** — limitations section present; non-JS/TS source files explicitly excluded |
| No verdict / score | **Yes** — report explains; reader judges |

**Verdict:** The explanation format is **trustworthy on real PRs** for the familiarity signal and for blast radius where the import graph resolves correctly.

## Known caveats (not blockers for demo validation)

1. **Monorepo import graph undercounting** — On zod #6098, core `schemas.ts` files report "Depended on by no modules" despite being central. Cross-package imports within monorepos may not fully resolve in v1. This is separate from path-alias scope (below); blast-radius numbers should be read as a lower bound.

2. **Path alias resolution scope** — Path aliases are resolved only from the repository root `tsconfig.json` or `jsconfig.json` (`compilerOptions.paths` / `baseUrl`). Aliases defined only in bundler config (e.g. Vite, Webpack) or nested package configs are not applied. Zero-dependent counts on heavily imported files may reflect this gap rather than true isolation.

3. **Bot/co-author identity** — renovate[bot] PRs produce familiarity based on bot email, which is low-signal. Acceptable for demo; called out here for human review.

4. **Test file blast radius** — Changed test files often show zero importers. Factually correct but low signal; reader can ignore isolated test-file entries.

5. **PR ref fetch** — PR numbers require `git fetch origin pull/N/head:refs/remotes/origin/pull/N/head` locally. The validation script handles this.

## Conclusion

The evidence report format passes the senior-engineer acceptance test on real TypeScript PRs (JavaScript/TypeScript blast-radius scope including static-literal `require()` and transitive reach via static import chains; validation repos were TS-heavy). Familiarity findings are per changed file, combine git blame (current line ownership and windowed line churn) with commit history, and are the strongest signal today. Blast-radius findings are credible on simpler repo layouts (type-fest, local fixtures) and honestly bounded where monorepo resolution is incomplete.

**Go/no-go:** Proceed — the explanation is worth showing to Peter for final human sign-off, with monorepo blast-radius caveats noted.
