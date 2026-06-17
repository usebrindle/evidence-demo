# Evidence demo LLD 0001 ... Familiarity analyzer

## Purpose

Given a pull request's changed files and the repo's git history, produce a finding that explains how much history the PR's author has with each changed file. This is the evidence behind Peter's first item ... a senior backend engineer touching a frontend file they have never worked in is higher risk than a mid-level engineer changing code they have owned and iterated on for months. The analyzer is language-agnostic, since git history does not care about language, and it is written core-shaped so it can lift into the engine later.

## What it computes

For the PR author and each unique changed file path, it derives signals from git log over a recent window, for example the last six months:

- How many commits the author has made to that file.
- How recently the author last touched that file, since recency matters.
- The author's share of total activity on that file, normalized by the file's overall churn, so "owns this code" versus "first time here" is distinguishable.

From these it produces a per-file familiarity characterization (for example high, moderate, none) and the underlying numbers that justify it, because the justification is the point, not the label. There is no directory aggregation ... each finding corresponds to one changed file path, aligned with the changed-files list and blast-radius findings.

## The contract, core-shaped

A pure function. Input ... the author identity, the list of touched paths, and a way to query git history for the repo (the analyzer does not shell out to git itself in its core form, it takes a history source, so the impure git access is at the edge and the analysis is testable). Output ... a structured familiarity finding per touched file, each carrying `touchedFile`, commit counts, `shareOfFileChurn`, recency, and the characterization. No formatting, no CLI, no printing. The CLI wrapper supplies a concrete git-backed history source and formats the findings.

This separation is what lets the analyzer move into the core later, where the history source would be supplied differently, while the analysis logic is unchanged.

## Vertical slices

Slice 1 ... for one touched file and the author, count the author's commits to that file over the window from a real git log, and return a raw count. Proves the git-history-to-finding path end to end against a real repo.

Slice 2 ... add recency (last touch date) per file, so each changed file produces a fuller picture than a commit count alone.

Slice 3 ... normalize by the file's total churn to produce the share-of-activity signal and the high/moderate/none characterization, with all supporting numbers retained for the report.

## Out of scope for the demo

The robustness items that make this trustworthy on real repos are deferred ... renamed and moved files (git history breaks across renames without follow logic), squashed commits (collapse many authors' work into one), bot commits and co-authored commits (mis-attribute authorship), reviewers who shaped code but rarely commit (invisible to commit history), and new team members (no history is not the same as low familiarity in a way the demo will not yet distinguish). These are exactly the hard parts Peter named, and they are the product, not the demo. The demo computes the naive version and is honest in the report about what it does not yet handle.

## Notes for the report

The report should show the numbers, not just the label, because a senior engineer trusts "author has 2 commits to this file in 6 months, last one 4 months ago, versus 180 commits to this file total by others" far more than "familiarity ... low." Each Familiarity line labels the full changed file path (for example `src/auth.ts`), not a parent directory. The explanation earning trust is the entire acceptance test.

## Dependencies

Standalone for the demo. Core-destined. Pairs with the blast-radius analyzer (LLD 0002) in the report (LLD 0003).
