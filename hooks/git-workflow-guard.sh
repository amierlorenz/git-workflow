#!/bin/bash
# PreToolUse hook (matcher: Bash). Enforces the per-project git workflow mode.
# Mode comes from .claude/settings.local.json -> env.CLAUDE_GIT_WORKFLOW ("hands-on" | "pr").
# Missing mode = hands-on, so unconfigured projects keep the ask-every-time behavior.
# `git-workflow-guard.sh --mode <dir>` prints the mode of <dir>'s repo for the status indicator.

repo_mode() { # $1 = dir; sets root, mode (pr|hands-on|unset, empty outside a repo) and marked
  root=$(git -C "$1" rev-parse --show-toplevel 2>/dev/null) mode= marked=
  [ -n "$root" ] || return
  # The settings file is gitignored, so a worktree's may lack the mode (or hold only other keys like
  # attribution): fall back to the main checkout's.
  local main f
  main=$(dirname "$(git -C "$root" rev-parse --path-format=absolute --git-common-dir)")
  for f in "$root" "$main"; do
    mode=$(jq -r '.env.CLAUDE_GIT_WORKFLOW // empty' "$f/.claude/settings.local.json" 2>/dev/null)
    [ -n "$mode" ] && break
  done
  mode=${mode:-unset}
  # Cloud sessions (/autofix-pr) only see the repo's CLAUDE.md, so pr mode needs the rules in it.
  grep -qs 'git-workflow:pr' "$root/CLAUDE.md" "$root/.claude/CLAUDE.md" && marked=1
}

if [ "$1" = --mode ]; then
  repo_mode "$2"
  [ "$mode" = pr ] && [ -z "$marked" ] && mode="pr (no CLAUDE.md marker)"
  echo "$mode"
  exit 0
fi

input=$(cat)
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")

decide() { # $1 = allow|ask|deny, $2 = reason
  jq -n --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}

# A command word: at line start or after a separator, optionally behind `env -u X` / `VAR=x`.
P='(^|[;&|(][[:space:]]*)(env( -u [A-Za-z_]+| [A-Za-z_]+=[^ ]*)* )?'
C=" -C (\"[^\"]*\"|'[^']*'|[^ ]+)" # git -C <dir>, quoted or not

# Only care about commands that publish or rewrite git history.
grep -qE "${P}(git(${C})? (commit|push)|gh pr (create|merge))([^[:alnum:]_-]|\$)" <<<"$cmd" || exit 0

# Never: merging is the human's gate, force-push rewrites remote history.
# Flags count only up to the push's own separator, so a later `gh api -f` isn't a force-push.
grep -qE "${P}gh pr merge" <<<"$cmd" && decide deny "Merging is yours to do. Review and merge the PR on GitHub."
grep -qE "${P}git(${C})? push[^;&|]*( -f( |\$)|--force| \+[^ ]+)" <<<"$cmd" && decide deny "Force-push is never allowed."

# Compound commands could hide anything behind an auto-allowed commit, so a human looks.
# Inert text is blanked first so commit messages don't count: <<'EOF' heredocs, '…', and "…" without $( or `.
# A leading `cd <dir> &&` only picks the repo, so it's dropped (unless <dir> runs code).
code=$(perl -0777 -pe 's/\$\(cat <<-?\x27(\w+)\x27\n.*?\n\s*\1\s*\n\s*\)//gs;
  s/(\x27[^\x27]*\x27)|("(?:[^"\\]|\\.)*")/defined $1 ? "" : ($2 =~ m{\$\(|\x60} ? "\$(" : "")/ge;
  s/^\s*cd [^;&|\$\x60]+&&//' <<<"$cmd")
grep -qE '&&|\|\||;|\||\$\(|`' <<<"$code" && decide ask "Compound command touching git history."

# The repo the command acts on: git -C <dir>, relative to a leading `cd <dir>`, relative to the session's cwd.
abs() { # $1 = base, $2 = path, maybe quoted, ~ or relative
  local p=${2#[\"\']}; p=${p%[\"\']}
  [[ $p == "~" || $p == "~/"* ]] && p=$HOME${p:1}
  [[ $p == /* ]] || p=$1/$p
  echo "$p"
}
dir=$cwd
re_cd="^[[:space:]]*cd[[:space:]]+(\"[^\"]*\"|'[^']*'|[^ ;&|]+)[[:space:]]*&&"
[[ $cmd =~ $re_cd ]] && dir=$(abs "$dir" "${BASH_REMATCH[1]}")
c=$(grep -oE "git${C}" <<<"$cmd" | head -1 | sed -E "s/^git -C //")
[ -n "$c" ] && dir=$(abs "$dir" "$c")

repo_mode "$dir"
[ "$mode" = pr ] || decide ask "hands-on mode: every commit, push and PR needs your yes."
[ -n "$marked" ] ||
  decide deny "pr mode is set but the repo CLAUDE.md has no git-workflow:pr section. Run the git-workflow skill setup first."

branch=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null)

if [[ "$branch" =~ ^(main|master)$ ]] || grep -qE "${P}git(${C})? push.*[ :](main|master)( |\$)" <<<"$cmd"; then
  decide ask "pr mode: direct changes to main need your yes."
fi
decide allow "pr mode: feature branch '$branch'."
