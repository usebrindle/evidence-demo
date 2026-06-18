# Evidence demo LLD 0001 ... Familiarity analyzer

## Purpose

Given a pull request's changed files and the repo's git history, produce a finding that explains how much history the PR's author has with each changed file. This is the evidence behind Peter's first item ... a senior backend engineer touching a frontend file they have never worked in is higher risk than a mid-level engineer changing code they have owned and iterated on for months. The analyzer is language-agnostic, since git history does not care about language, and it is written core-shaped so it can lift into the engine later.

**Implementation status:** Slices 1–7 are implemented in `evidence-demo/`. Familiarity is measured at `baseRevision` (merge-base for PR/branch mode; resolved base for explicit ranges). Commits and line changes in `base..head` are excluded from all signals and characterization.

## Measurement boundary

Familiarity answers: **"How familiar was the PR author with this file before this change?"**

All signals are measured at **`baseRevision`**:

- **PR or branch mode:** merge-base between the default branch and the PR/branch head.
- **Explicit `base...head` range:** the resolved base ref.

Commits and line changes in **`base..head` are excluded** from every signal and from characterization. The PR under review must not inflate familiarity — an author's first touch of a file in this PR should not read as `moderate` merely because the PR commit exists.

**`headRevision`** remains in the changed-files contract for diff resolution and blast-radius analysis only. Familiarity does not use `headRevision`.

**Edge cases:**

- **File added in the PR** (absent at `baseRevision`): zero commits, zero blameable lines → `none` with honest report copy.
- **File deleted only in the PR** (present at `baseRevision`, absent at head): familiarity is still computed at `baseRevision` for the path that existed before the change.
- **Explicit commit ranges:** `baseRevision` is the resolved base ref; the same exclusion applies to commits after base.

## What it computes

For the PR author and each unique changed file path, it derives three classes of signals. Commit counts measure activity and recency; line-level blame measures ownership. **Commit-share is not line ownership** ... counting how many times someone committed to a file is a weak proxy for familiarity when one author can rewrite most of a file in a single commit while another makes many small edits.

### Line-level signals (primary ownership indicators)

**Current content ownership** (snapshot at `baseRevision`)

- Run `git blame` on the file at `baseRevision`.
- Count **blameable lines**: non-empty physical lines (blank lines excluded; comment-only lines count as blameable for v1 simplicity).
- `authorOwnedLineCount` = lines whose attributed author email matches the PR author.
- `totalBlameableLineCount` = all blameable lines in the file at that revision.
- `shareOfCurrentContent` = `authorOwnedLineCount / totalBlameableLineCount` (0 when the file is empty or unblameable).

Answers: *"Of the code in this file before this PR, how much is attributable to this author?"*

**Windowed line churn** (within the same six-month window as commit signals, before this PR)

- Attribute line changes in the window using `git blame --since=<windowStart>` on the file at `baseRevision` (canonical approach for v1; equivalent annotation walks such as `git log -L` are acceptable alternatives if they produce the same contract).
- `authorChangedLineCount` = lines whose last modification within the window is by the author.
- `totalChangedLineCount` = all lines with a last modification within the window.
- `shareOfWindowedLineChurn` = `authorChangedLineCount / totalChangedLineCount` (0 when no line changes occurred in the window).

Answers: *"Of the line-level churn on this file in the last six months before this PR, how much did this author write?"*

### Commit signals (activity and recency)

From `git log --since=<windowStart> <baseRevision>` over the same six-month window (not through head):

- `authorCommitCount` ... how many commits the author made to that file before this PR.
- `totalFileCommitCount` ... total commits to that file in the window before this PR.
- `lastTouchDate` ... date of the author's most recent commit to that file before this PR (recency gate).
- `shareOfFileCommitChurn` = `authorCommitCount / totalFileCommitCount` (0 when the file has no commits in the window). This is **commit-share**, not line-share. The former name `shareOfFileChurn` is retired in favor of this explicit name.

### Characterization

From all signals it produces a per-file familiarity characterization (`high`, `moderate`, or `none`) and every underlying number that justifies it, because the justification is the point, not the label. There is no directory aggregation ... each finding corresponds to one changed file path, aligned with the changed-files list and blast-radius findings.

**Recency gate.** Familiarity is not lifetime ownership. An author may own most current lines but have not touched the file in months; stale context cannot yield `high`. Recency continues to come from commit `lastTouchDate`.

**Combined rule.** Characterization uses the stronger of line signals or commit activity, gated by recency. Default thresholds (tunable constants):

| Tier | Rule |
|------|------|
| **none** | `authorCommitCount === 0` OR `lastTouchDate === null` OR last touch > 180 days OR (last touch > 120 days AND `authorCommitCount === 1`) |
| **high** | last touch ≤ 60 days AND any of: `shareOfCurrentContent ≥ 0.25` OR `shareOfWindowedLineChurn ≥ 0.25` OR `authorCommitCount ≥ 3` |
| **moderate** | not none, not high, AND any of: (last touch ≤ 120 days AND `authorCommitCount ≥ 2`) OR (last touch 121–180 days AND `authorCommitCount ≥ 2`) OR (`shareOfCurrentContent ≥ 0.10` OR `shareOfWindowedLineChurn ≥ 0.10`) with last touch ≤ 120 days |
| **fallback** | else `none` |

Line signals remain the primary path for the single-rewrite case (one pre-PR commit with high line ownership). Commit count is a supporting path for tiny or heavily churned files where blame is thin, but **a single pre-PR commit with low line shares is not sufficient for `moderate`**. A PR that is the author's **first ever touch** of a file should characterize as **`none`**, not `moderate`. Recency still blocks `high` on stale work.

## The contract, core-shaped

A pure function. Input ... the author identity, the list of touched paths, `baseRevision`, a git-history source, and a git-blame source (the analyzer does not shell out to git itself; impure git access is at the edge and the analysis is testable). Output ... a structured familiarity finding per touched file. No formatting, no CLI, no printing. The CLI wrapper supplies concrete git-backed sources and formats the findings.

```typescript
// Target contract (evidence-demo/src/analyzers/familiarity.ts, src/inputs/gitHistorySource.ts, src/inputs/gitBlameSource.ts, src/inputs/changedFiles.ts)
interface ChangedFilesResult {
  changedFiles: string[];
  author: AuthorIdentity;
  baseRevision: string;  // familiarity measurement stop point
  headRevision: string;  // diff / blast-radius only
}

interface GitHistoryQuery {
  authorEmail: string;
  path: string;
  since: Date;
  revision: string;  // baseRevision — log stops here
}

interface GitHistoryStats {
  authorCommitCount: number;
  totalFileCommitCount: number;
  lastTouchDate: Date | null;
}

interface GitHistorySource {
  query(query: GitHistoryQuery): GitHistoryStats;
}

interface GitBlameQuery {
  path: string;
  authorEmail: string;
  since: Date;       // window start for windowed line churn
  revision: string;  // baseRevision — blame snapshot
}

interface GitBlameStats {
  authorOwnedLineCount: number;
  totalBlameableLineCount: number;
  authorChangedLineCount: number;
  totalChangedLineCount: number;
}

interface GitBlameSource {
  query(query: GitBlameQuery): GitBlameStats;
}

interface FamiliarityInput {
  author: AuthorIdentity;
  touchedPaths: string[];
  baseRevision: string;
  historySource: GitHistorySource;
  blameSource: GitBlameSource;
  asOf?: Date;
}

interface FamiliarityFinding {
  touchedFile: string;
  // Line-level
  authorOwnedLineCount: number;
  totalBlameableLineCount: number;
  shareOfCurrentContent: number;
  authorChangedLineCount: number;
  totalChangedLineCount: number;
  shareOfWindowedLineChurn: number;
  // Commit-level
  authorCommitCount: number;
  totalFileCommitCount: number;
  lastTouchDate: Date | null;
  shareOfFileCommitChurn: number;
  // Label
  characterization: "high" | "moderate" | "none";
}
```

This separation is what lets the analyzer move into the core later, where the history and blame sources would be supplied differently, while the analysis logic is unchanged.

## Vertical slices

Slice 1 ... for one touched file and the author, count the author's commits to that file over the window from a real git log, and return a raw count. Proves the git-history-to-finding path end to end against a real repo.

Slice 2 ... add recency (`lastTouchDate`) per file, so each changed file produces a fuller picture than a commit count alone.

Slice 3 ... add commit-share (`shareOfFileCommitChurn`) and the combined high/moderate/none characterization rule (line signals plus commit activity, recency-gated), with all supporting numbers retained for the report.

Slice 4 ... for one touched file, run current-content blame at the analysis revision and return raw line counts plus `shareOfCurrentContent`.

Slice 5 ... for one touched file, run windowed line churn via `git blame --since` (or equivalent) and return raw line counts plus `shareOfWindowedLineChurn`.

Slice 6 ... full `analyzeFamiliarity` with all commit and line signals, updated characterization, and complete `FamiliarityFinding` output per touched file.

Slice 7 ... wire `baseRevision` from changed-files resolution through history and blame sources and characterization; tighten the moderate rule (remove the single-commit floor); add fixtures for first-time-touch → `none` and pre-PR single-rewrite → `high`.

## Out of scope for the demo

The robustness items that make this trustworthy on real repos are deferred. These apply to both commit history and blame:

**Commit-history caveats** ... renamed and moved files (history breaks across renames without follow logic), squashed commits (collapse many authors' work into one), bot commits and co-authored commits (mis-attribute authorship), reviewers who shaped code but rarely commit (invisible to commit history), and new team members (no history is not the same as low familiarity in a way the demo will not yet distinguish).

**Blame-specific caveats** ... binary or non-text files (no meaningful line blame), generated or minified files (misleading ownership), rename tracking (`git blame -M` / `-C` not applied ... lines may attribute to the wrong author across moves), squash merges collapsing multi-author line history, `Co-authored-by` trailers not reflected in blame attribution, whitespace-only or formatting-only churn inflating windowed metrics, and files that did not exist at `baseRevision` (treat as zero blameable lines or skip with an explicit report note).

These are exactly the hard parts Peter named, and they are the product, not the demo. The demo computes the naive version and is honest in the report about what it does not yet handle.

## Notes for the report

The report should show the numbers, not just the label. Lead with line facts, then commit facts. All familiarity numbers and labels are **pre-PR** (measured at merge-base, excluding this PR's commits and line changes).

A senior engineer trusts "author owned 62% of lines and 41% of line churn in six months before this PR (3 commits, last touch 10 days ago; 7 commits by others in window)" far more than "familiarity ... low."

First-time touch example:

> Author owned 0% of lines and 0% of line churn in 6 months before this PR (no author commits in window; 11 commits by others in window).

Each Familiarity line labels the full changed file path (for example `src/auth.ts`), not a parent directory. The explanation earning trust is the entire acceptance test. See LLD 0003 for report copy and limitations.

## Dependencies

Standalone for the demo. Core-destined. Pairs with the blast-radius analyzer (LLD 0002) in the report (LLD 0003).
