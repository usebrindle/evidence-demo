#!/usr/bin/env bash
# Run evidence-demo against real PRs from known TypeScript repos.
# Requires local clones with fetched pull refs:
#   git fetch origin pull/<N>/head:refs/remotes/origin/pull/<N>/head
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="${SCRIPT_DIR}/../dist/cli.js"
VALIDATION_DIR="${EVIDENCE_VALIDATION_DIR:-/tmp/evidence-validation}"

if [[ ! -f "$CLI" ]]; then
  echo "Build evidence-demo first: npm run build" >&2
  exit 1
fi

run_pr() {
  local repo="$1"
  local pr="$2"
  local repo_path="${VALIDATION_DIR}/${repo}"

  if [[ ! -d "$repo_path/.git" ]]; then
    echo "Skip ${repo}#${pr}: clone not found at ${repo_path}" >&2
    return 0
  fi

  echo "========== ${repo} PR ${pr} =========="
  (cd "$repo_path" && git fetch origin "pull/${pr}/head:refs/remotes/origin/pull/${pr}/head" 2>/dev/null || true)
  node "$CLI" "$repo_path" "$pr"
  echo ""
}

mkdir -p "$VALIDATION_DIR"

run_pr zod 6098
run_pr zod 6096
run_pr type-fest 1461
run_pr type-fest 1460
run_pr citty 243
