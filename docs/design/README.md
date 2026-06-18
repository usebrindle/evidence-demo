# Evidence demo ... LLD set

## What this is

A local command-line tool that, given a cloned repository and a pull request (or a base...head commit range), prints a human-readable evidence report explaining why a change is or is not risky. It computes two of the five evidence items Peter enumerated ... author-module familiarity and reverse-dependency blast radius. Everything runs locally against a local clone. Nothing is sent anywhere and nothing is stored.

## Why it exists

It is an experiment, not a product. Its single job is to test whether the contextual evidence, shown on real pull requests, clears the bar Peter set. It exists as a CLI rather than inside the Action because the validation loop is "tune the explanation until a senior engineer accepts it," and a local CLI iterates against any repo and any historical PR instantly, with no commit-build-push-trigger cycle and no per-PR CI cost. The Action remains the product. This is the test rig.

## The acceptance criterion, committed in advance

This is the lean discipline ... the success test is written before the build and before Peter sees output, so the result can change the decision rather than be rationalized after.

Validated ... Peter (or another senior engineer) reads the evidence report on real pull requests and says, in substance, "yes, that is actually why this PR is or is not risky." The explanation is one he would act on or at least take seriously, not one he shrugs at or finds misleading.

Refuted ... the report is noise, obvious, or wrong often enough that a senior engineer would not trust it. The familiarity or blast-radius findings do not match an experienced reader's intuition about the real PRs, or the explanation adds nothing over reading the diff.

If refuted, the robustness grind is not worth starting. If validated, the analyzers lift into the core and the robustness work begins with confidence.

## Scope

In scope ... two evidence items computed roughly, on a single repo at a time, with blast radius computed from JavaScript and TypeScript static ESM imports and static-literal CommonJS `require()` (`.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`). Blast radius characterizes from transitive reach (LLD 0002 Slice 5), with direct dependent count as supporting evidence. Familiarity is per changed file: pre-PR git history and line-level blame at merge-base for **modified** files; **added** files characterize as **`high` (greenfield)** by change kind with explicit report copy. A readable report. Local only.

Explicitly out of scope, deferred to the product if validated ... the robustness Peter listed (renamed and moved files, squashed commits, generated code, bot commits, co-authored commits, reviewers who rarely commit, new team members, monorepo boundaries, dynamic imports), multi-language blast radius (Python, Go, and other non-JS/TS languages), the other three evidence items (public-interface touches, resemblance to past clean merges, resemblance to past reverts and incidents), weighted reach scoring (PageRank, entry-point detection), any scoring, any storage, any hosting.

## The compounding discipline

The two analyzers are written as pure, core-shaped functions ... they take explicit inputs and return structured findings, with no CLI or formatting logic inside them. If the demo validates, the analyzers move into `@usebrindle/merge-risk-core` as the foundation of contextual criteria and an evidence-report capability, and only the thin CLI wrapper is discarded. The demo is the experiment, the analyzers are the asset, and the structure keeps the asset separable from the experiment.

## The LLDs

1. [0001-familiarity-analyzer.md](0001-familiarity-analyzer.md) ... author familiarity per changed file: pre-PR git history and line-level blame for **modified** files; **added** files as greenfield **`high`** by change kind. Language-agnostic. Core-destined.
2. [0002-blast-radius-analyzer.md](0002-blast-radius-analyzer.md) ... reverse-dependency breadth from JavaScript and TypeScript static import and static-literal `require()` analysis; transitive reach as the characterization signal, direct count as evidence. Core-destined.
3. [0003-evidence-report-and-cli.md](0003-evidence-report-and-cli.md) ... assembles the analyzer findings into the human-readable report and wraps them in the throwaway CLI.

## Build order

Familiarity first, because it is language-agnostic and the simpler of the two, so it proves the whole loop (clone in, findings out, report printed) end to end fastest. Then blast radius. Then the report formatting, which is where the real tuning against Peter's bar happens, since the explanation is the product.
