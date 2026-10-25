#!/bin/bash
# PreToolUse hook (matcher: Bash). Enforces the per-project git workflow mode.
# Mode comes from .claude/settings.local.json -> env.CLAUDE_GIT_WORKFLOW ("hands-on" | "pr").
# Missing mode = hands-on, so unconfigured projects keep the ask-every-time behavior.

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
grep -qE "${P}gh pr merge" <<<"$cmd" && decide deny "Merging is yours to do. Review and merge the PR on GitHub."
grep -qE "${P}git(${C})? push.*( -f( |\$)|--force| \+[^ ]+)" <<<"$cmd" && decide deny "Force-push is never allowed."

# Compound commands could hide anything behind an auto-allowed commit, so a human looks.
# Inert text is blanked first so commit messages don't count: <<'EOF' heredocs, '…', and "…" without $( or `.
code=$(perl -0777 -pe 's/\$\(cat <<-?\x27(\w+)\x27\n.*?\n\s*\1\s*\n\s*\)//gs;
  s/(\x27[^\x27]*\x27)|("(?:[^"\\]|\\.)*")/defined $1 ? "" : ($2 =~ m{\$\(|\x60} ? "\$(" : "")/ge' <<<"$cmd")
grep -qE '&&|\|\||;|\||\$\(|`' <<<"$code" && decide ask "Compound command touching git history."

project=${CLAUDE_PROJECT_DIR:-$cwd}
mode=$(jq -r '.env.CLAUDE_GIT_WORKFLOW // empty' "$project/.claude/settings.local.json" 2>/dev/null)
[ "$mode" = pr ] || decide ask "hands-on mode: every commit, push and PR needs your yes."

# Cloud sessions (/autofix-pr) only see the repo's CLAUDE.md, so pr mode refuses to run without the rules in it.
grep -qs 'git-workflow:pr' "$project/CLAUDE.md" "$project/.claude/CLAUDE.md" ||
  decide deny "pr mode is set but the repo CLAUDE.md has no git-workflow:pr section. Run the git-workflow skill setup first."

dir=$(grep -oE "git${C}" <<<"$cmd" | head -1 | sed -E "s/^git -C //; s/^[\"']//; s/[\"']\$//")
branch=$(git -C "${dir:-$cwd}" rev-parse --abbrev-ref HEAD 2>/dev/null)

if [[ "$branch" =~ ^(main|master)$ ]] || grep -qE "${P}git(${C})? push.*[ :](main|master)( |\$)" <<<"$cmd"; then
  decide ask "pr mode: direct changes to main need your yes."
fi
decide allow "pr mode: feature branch '$branch'."
