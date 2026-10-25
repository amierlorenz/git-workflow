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
# A worktree has the tracked CLAUDE.md but not the gitignored settings.local.json.
git -C p-pr add CLAUDE.md && git -C p-pr commit -qm docs && git -C p-pr worktree add -q -b feat/2-y "$PWD/wt"
mkdir outside p-pr/sub
t() { # project, command, expected
  out=$(jq -n --arg c "$2" --arg w "$PWD/$1" '{tool_input:{command:$c},cwd:$w}' | CLAUDE_PROJECT_DIR="$PWD/$1" $H | jq -r '.hookSpecificOutput.permissionDecision')
  out=${out:-none}; [ "$out" = "$3" ] && s=PASS || { s=FAIL; fails=$((fails+1)); }
  printf '%s %-9s %-52s -> %s\n' $s "$1" "$2" "$out"; }
t p-pr 'git commit -m "feat: x"' allow
t p-pr 'gh pr create --fill' allow
t p-pr 'env -u GH_TOKEN git push -u origin feat/1-x' allow
t p-pr 'git push origin main' ask
t p-pr 'git push --force-with-lease' deny
t p-pr 'git push origin +feat/1-x' deny
t p-pr 'env -u GH_TOKEN git push -f' deny
t p-pr 'gh pr merge 1 --squash' deny
t p-pr 'git add a && git commit -m "x"' ask
t p-pr 'git status' none
t p-pr "echo 'remember: gh pr merge is yours'" none
t p-pr 'grep -r "git push" docs/' none
t p-nomark 'git commit -m "feat: x"' deny
t p-none 'git commit -m "feat: x"' ask
t p-none 'env -u GH_TOKEN gh pr create --fill' ask
t p-none "git -C \"$PWD/p space\" commit -m x" allow
t "p space" "git -C \"$PWD/p space\" commit -m x" allow
t p-pr "git -C $PWD/p-none commit -m x" ask
# Bug 1: mode, marker and branch come from the repo the command targets, not the session's start folder.
t outside "cd $PWD/p-pr && git commit -m x" allow
t outside "cd p-pr && git commit -m x" allow
t outside "git -C $PWD/p-pr commit -m x" allow
t outside 'git commit -m x' ask
t outside 'cd /nonexistent && git commit -m x' ask
t p-pr "cd $PWD/p-none && git commit -m x" ask
t p-pr/sub 'git commit -m x' allow
t wt 'git commit -m x' allow
# Bug 2: a leading cd plus one git/gh command is not compound; anything more still is.
t p-pr "cd \"$PWD/p space\" && git commit -m \"feat: x\"" allow
t p-pr "cd $PWD/p-pr && env -u GH_TOKEN gh pr create --fill" allow
t p-pr "cd $PWD/p-pr && git push origin main" ask
t p-pr "cd $PWD/p-pr && git add a && git commit -m x" ask
t p-pr "cd $PWD/p-pr && git commit -m x; echo hi" ask
# Bug 3: force flags count only inside the push command's own segment.
t p-pr 'git push -q -u origin feat/1-x && gh api -f mode=gfm /markdown' ask
t p-pr 'git push --force origin feat/1-x && echo done' deny
t p-pr "cd $PWD/p-pr && git push -f" deny
echo "failures: $fails"
[ "$fails" = 0 ]
