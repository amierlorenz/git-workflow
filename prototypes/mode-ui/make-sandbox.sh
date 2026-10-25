#!/bin/bash
# Throwaway sandbox for testing the git-workflow plugin. Re-run to reset.
# Remove with: rm -rf ~/Developer/learning/git-workflow-sandbox
set -euo pipefail
GUARD="$(cd "$(dirname "$0")/../.." && pwd)/hooks/git-workflow-guard.sh"
S=~/Developer/learning/git-workflow-sandbox
rm -rf "$S"
mkdir -p "$S/remotes" "$S/notes"
cd "$S"

mk() { # repo, mode ('' = unset), marker (yes|no)
  git init -q -b main "$1"
  git init -q --bare "remotes/$1.git"
  git -C "$1" remote add origin "$S/remotes/$1.git"
  mkdir "$1/.claude"
  echo '.claude/settings.local.json' > "$1/.gitignore"
  echo "# $1" > "$1/README.md"
  [ -z "$2" ] || echo "{\"env\":{\"CLAUDE_GIT_WORKFLOW\":\"$2\"}}" > "$1/.claude/settings.local.json"
  [ "$3" = no ] || printf '## Git workflow (pr mode)\n<!-- git-workflow:pr -->\n- Never commit to main, never merge, never force-push.\n' > "$1/CLAUDE.md"
  git -C "$1" add -A
  git -C "$1" commit -q -m "chore: sandbox setup"
  git -C "$1" push -q origin main
  git -C "$1" switch -q -c feat/1-demo
}

mk pr-repo pr yes
mk hands-on-repo hands-on no
mk unset-repo '' no
mk pr-no-marker pr no
git -C pr-repo worktree add -q -b feat/2-worktree "$S/pr-repo-wt"

echo "Sandbox ready: $S"
for d in pr-repo pr-repo-wt hands-on-repo unset-repo pr-no-marker notes; do
  printf '  %-14s mode: %s\n' "$d" "$("$GUARD" --mode "$S/$d")"
done
