# evidence-demo

Local CLI experiment for [Brindle](https://github.com/usebrindle) merge-risk: given a cloned repository and a pull request (or commit range), print a human-readable **evidence report** explaining why a change may or may not be risky.

This is a **test rig**, not the product. The GitHub Action remains the product. This repo exists to validate whether contextual evidence clears the bar for senior engineers before investing in robustness work.

**Computes two evidence signals:**

1. **Author-module familiarity** — git history over 6 months (language-agnostic)
2. **Reverse-dependency blast radius** — JavaScript/TypeScript static ESM import and static-literal CommonJS `require()` graph (direct dependents only)

No risk score. No merge recommendation. Evidence only.

## Quick start

```bash
cd evidence-demo
npm install
npm run build

# Analyze a local clone
node dist/cli.js /path/to/clone 6098              # PR number (requires local pull ref)
node dist/cli.js /path/to/clone main...feature    # commit range
node dist/cli.js /path/to/clone feature-branch    # branch vs default
```

Example against this repo:

```bash
node dist/cli.js .. HEAD~5...HEAD
```

## Validation

Real PR results and the senior-engineer acceptance assessment are in [`evidence-demo/VALIDATION.md`](evidence-demo/VALIDATION.md).

Re-run the validation suite:

```bash
cd evidence-demo
npm run build
./scripts/run-validation-prs.sh
```

Requires local clones under `$EVIDENCE_VALIDATION_DIR` (default `/tmp/evidence-validation`). See VALIDATION.md for setup.

## Development

```bash
cd evidence-demo
npm run typecheck
npm run test    # 76 tests
npm run build
```

## Repository layout

```
evidence-demo/     CLI package (analyzers, inputs, report, tests)
docs/design/       Low-level design docs (LLDs) for the experiment
```

## Design docs

- [Design overview](docs/design/README.md)
- [Familiarity analyzer](docs/design/0001-familiarity-analyzer.md)
- [Blast-radius analyzer](docs/design/0002-blast-radius-analyzer.md)
- [Evidence report & CLI](docs/design/0003-evidence-report-and-cli.md)

## Known limitations (demo scope)

Documented in report output and VALIDATION.md. Notable gaps deferred to product work if validated:

- Monorepo / cross-package import resolution (blast radius undercounts)
- Transitive dependencies, dynamic `require()` and non-literal dynamic `import()`, platform-specific module resolution, non-JS/TS source files
- Git robustness (renames, squashes, bots, co-authors)
- Three additional evidence items not yet implemented

**Familiarity** is the strongest signal today. **Blast radius** is credible on simple single-package layouts.

## Privacy

Everything runs locally against a local clone. Reads git history and source files only. Writes to stdout. Nothing is transmitted or stored.

## License

TBD
