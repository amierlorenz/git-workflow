---
name: git-workflow
description: Set up or change a project's git workflow mode (hands-on or pr). Use before the first commit in a project whose .claude/settings.local.json has no env.CLAUDE_GIT_WORKFLOW, when the git-workflow-guard hook denies a commit for a missing setup, or when the user invokes /git-workflow or asks to switch modes.
---

The mode lives in the project's `.claude/settings.local.json` as `env.CLAUDE_GIT_WORKFLOW`.
`~/.claude/hooks/git-workflow-guard.sh` reads it on every commit, push and `gh pr create`.

## 1. Check current state

```bash
jq -r '.env.CLAUDE_GIT_WORKFLOW // "unset"' .claude/settings.local.json 2>/dev/null || echo unset
grep -s 'git-workflow:pr' CLAUDE.md .claude/CLAUDE.md
```

If the mode is set (and, for `pr`, the marker is present), say so and stop unless the user wants to change it.

## 2. Ask the user to pick

- **hands-on**: they're at the keyboard. Every commit, push and PR waits for their yes.
- **pr**: Claude works on its own. Branch per feature, free commits and pushes on that branch, opens PRs,
  never merges. Needs a GitHub repo.

## 3. Write the mode

Merge into the file, keeping every other key (e.g. `attribution`):

```bash
mkdir -p .claude && f=.claude/settings.local.json && [ -f $f ] || echo '{}' > $f
jq --arg m "<mode>" '.env.CLAUDE_GIT_WORKFLOW = $m' $f > $f.tmp && mv $f.tmp $f
git check-ignore -q $f || echo "WARN: $f is not gitignored"
```

If it isn't ignored, add `.claude/settings.local.json` to `.gitignore`.

**hands-on stops here.** Steps 4–7 are pr mode only.

## 4. pr: repo CLAUDE.md rules

Cloud sessions (`/autofix-pr`) never see `~/.claude`, so the rules must live in the repo. Append this to `CLAUDE.md`
(create it if missing). The hook refuses pr-mode commits until the marker exists.

```markdown
## Git workflow (pr mode)
<!-- git-workflow:pr — checked by ~/.claude/hooks/git-workflow-guard.sh; keep this marker -->
- Never commit to main, never merge a PR, never force-push. If a branch falls behind main, merge main into it.
- One branch per issue or feature: `feat/<issue#>-<slug>`, `fix/<issue#>-<slug>`.
- Conventional Commits 1.0.0, subject line only unless the why isn't obvious from the diff.
  Breaking changes: `!` after the type and a `BREAKING CHANGE:` footer.
- Run `git add` and `git commit -m "<subject>"` as separate commands, never chained.
- PR title is a conventional commit (it becomes the squash commit on main).
  Body: what, why, how tested, open questions, `Closes #N`.
- Review comments: fix what's clear, ask on the PR when ambiguous, reply to every thread.
```

## 5. pr: GitHub repo

`gh repo view --json nameWithOwner` must succeed. If there is no remote, offer
`gh repo create <name> --private --source=. --push` and wait for a yes.
Commit the CLAUDE.md change to main as `docs: add git workflow rules` (the hook asks the user, since it's main) and push.

## 6. pr: Claude GitHub App (needed by /autofix-pr)

Claude can't install it or verify it. Tell the user to open https://github.com/apps/claude/installations/new,
add this repo, and confirm when done.

## 7. pr: merge settings

Ask first, then run. Squash-only with the PR title as the commit keeps main to one conventional commit per PR:

```bash
gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge
gh api -X PATCH "repos/{owner}/{repo}" -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK
```

Branch protection on private repos needs a paid GitHub plan; mention it, don't set it up.

## Report

One line per step: done, skipped (hands-on), or waiting on the user (the App install).
