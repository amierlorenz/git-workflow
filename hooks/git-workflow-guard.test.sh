#!/bin/bash
# Self-check for git-workflow-guard.sh. Run: bash hooks/git-workflow-guard.test.sh
H="$(cd "$(dirname "$0")" && pwd)/git-workflow-guard.sh" fails=0
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; cd "$T"
for d in p-pr p-nomark p-none "p space"; do
  mkdir -p "$d/.claude" && git -C "$d" init -q -b main && git -C "$d" commit -q --allow-empty -m init && git -C "$d" switch -q -c feat/1-x
done
for d in p-pr p-nomark "p space"; do echo '{"env":{"CLAUDE_GIT_WORKFLOW":"pr"}}' > "$d/.claude/settings.local.json"; done
printf '## Git workflow (pr mode)\n<!-- git-workflow:pr -->\n' > p-pr/CLAUDE.md
cp p-pr/CLAUDE.md "p space/CLAUDE.md"
git -C p-none switch -q main
t() { # project, command, expected
  out=$(jq -n --arg c "$2" --arg w "$PWD/$1" '{tool_input:{command:$c},cwd:$w}' | CLAUDE_PROJECT_DIR="$PWD/$1" $H | jq -r '.hookSpecificOutput.permissionDecision')
  out=${out:-none}; [ "$out" = "$3" ] && s=PASS || { s=FAIL; fails=$((fails+1)); }
  printf '%s %-9s %-52s -> %s\n' $s "$1" "$2" "$out"; }
t p-pr 'git commit -m "feat: x"' allow
t p-pr 'gh pr create --fill' allow
t p-pr 'env -u GH_TOKEN git push -u origin feat/1-x' allow
t p-pr 'git push origin main' ask
t p-pr 'git push --force-with-lease' deny
t p-pr 'env -u GH_TOKEN git push -f' deny
t p-pr 'gh pr merge 1 --squash' deny
t p-pr 'git add a && git commit -m "x"' ask
t p-pr 'git status' none
t p-pr "echo 'remember: gh pr merge is yours'" none
t p-pr 'grep -r "git push" docs/' none
t p-nomark 'git commit -m "feat: x"' deny
t p-none 'git commit -m "feat: x"' ask
t p-none 'env -u GH_TOKEN gh pr create --fill' ask
t p-none "git -C \"$PWD/p space\" commit -m x" ask
t "p space" "git -C \"$PWD/p space\" commit -m x" allow
t p-pr "git -C $PWD/p-none commit -m x" ask
echo "failures: $fails"
[ "$fails" = 0 ]
