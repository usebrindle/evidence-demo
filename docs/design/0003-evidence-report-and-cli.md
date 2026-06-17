# Evidence demo LLD 0003 ... Evidence report and CLI

## Purpose

Assemble the findings from the familiarity analyzer (LLD 0001) and the blast-radius analyzer (LLD 0002) into a single human-readable evidence report, and wrap the whole thing in a command-line tool that a user points at a local repo and a pull request. This is where the actual experiment is won or lost, because per Peter the product is the explanation, not the score, so the report is the thing being tested. The CLI itself is the throwaway wrapper. The report-assembly logic is closer to core-destined, since an evidence report is plausibly a core capability later.

## The report is the product

The acceptance test is whether a senior engineer reads the report and says "yes, that is actually why this PR is or is not risky." So the report is designed for that reader. It leads with the evidence and the supporting numbers, not a verdict. It shows, per changed file, the author's familiarity with the numbers behind it, and per changed JavaScript or TypeScript source file, the blast radius with the dependents named. It is honest about what it does not compute, because stated limitations are what make the computed parts trustworthy to a skeptic.

It deliberately does not produce a single risk score or a merge recommendation, because Peter explicitly said lead with evidence, not auto-merge. The report explains. The reader judges. That restraint is part of what is being tested.

## What the CLI does

- Takes a path to a local cloned repository and a pull request reference, or a base...head commit range, identifying the change to analyze.
- Determines the changed files and the author for that change from the local repo.
- Supplies the impure inputs the analyzers need ... a git-history source for familiarity, and a parsed import graph for blast radius ... by reading the local clone.
- Runs the two analyzers.
- Formats their findings into the evidence report and prints it.

Everything is local. The tool reads only the local clone and writes only to stdout. Nothing is transmitted or stored. This is also the embodiment of Peter's "computed in infrastructure I control, nothing leaves" constraint, so the tool demonstrates the privacy posture rather than asserting it.

## Components

```
evidence-demo/
  src/
    cli.ts                  # arg parsing, orchestration, the throwaway wrapper
    inputs/
      gitHistorySource.ts   # impure: reads git log from the local clone
      importGraphSource.ts   # impure: walks JS/TS sources and parses static imports and static-literal require() from the local clone
      changedFiles.ts        # impure: resolves the PR or range to changed files + author
    report/
      buildEvidenceReport.ts # pure: findings -> structured report
      renderReport.ts         # pure: structured report -> readable text
```

The analyzers themselves (LLD 0001, 0002) live as pure modules the CLI imports. The `inputs/` modules are the impure edge that the CLI owns and that would be replaced when the analyzers move into the core. The `report/` modules are pure and plausibly core-destined.

## Vertical slices

Slice 1 ... the CLI resolves a change to its changed files and author, runs the familiarity analyzer only, and prints a minimal familiarity report. Proves the end-to-end loop with one analyzer.

Slice 2 ... add the blast-radius analyzer and its section of the report, so both evidence items appear.

Slice 3 ... iterate the report formatting against real PRs until it reads the way a senior engineer would want. This slice is open-ended on purpose, because this is the tuning loop that the whole CLI-over-Action decision was made to enable. Run it against real PRs from real TypeScript repos, read the output critically, adjust what is surfaced and how it is explained, repeat.

## Out of scope for the demo

A score, a recommendation, the other three evidence items, multi-language blast radius (Python, Go, and other non-JS/TS languages), any persistence, any hosting, any robustness handling. Changed files outside JS/TS source extensions appear under "not analyzed for blast radius" in the report. The CLI is the experiment's rig and is expected to be discarded or heavily evolved once the analyzers lift into the core.

## How it gets used in the experiment

Run it against several real pull requests ... ideally some from Peter's or Sean's own repositories if they are TypeScript and available, or from Brindle's own repo and other known TypeScript projects where the risk of past PRs is known. Show the output to Peter against his acceptance test. The point is not a polished tool, it is whether the evidence, on real code he recognizes, makes him say "yes, that is actually why."

## Dependencies

Consumes the familiarity analyzer (LLD 0001) and blast-radius analyzer (LLD 0002). The CLI and input modules are throwaway. The report modules are pure and may lift into the core with the analyzers if the demo validates.
