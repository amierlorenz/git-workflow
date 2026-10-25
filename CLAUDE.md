# git-workflow

A Claude Code plugin by Amier ([amierlorenz](https://github.com/amierlorenz)): per-repo git workflow modes, enforced
by a PreToolUse hook. Listed in the [`amierlorenz/skills`](https://github.com/amierlorenz/skills) marketplace.

## Git workflow (pr mode)
<!-- git-workflow:pr — checked by the git-workflow plugin's guard hook; keep this marker -->
- Never commit to main, never merge a PR, never force-push. If a branch falls behind main, merge main into it.
- One branch per issue or feature: `feat/<issue#>-<slug>`, `fix/<issue#>-<slug>`.
- Conventional Commits 1.0.0, subject line only unless the why isn't obvious from the diff.
  Breaking changes: `!` after the type and a `BREAKING CHANGE:` footer.
- Run `git add` and `git commit -m "<subject>"` as separate commands, never chained.
- PR title is a conventional commit (it becomes the squash commit on main).
  Body: what, why, how tested, open questions, `Closes #N`.
- Review comments: fix what's clear, ask on the PR when ambiguous, reply to every thread.

## Checks
- Guard changes: a failing case in `hooks/git-workflow-guard.test.sh` first, then the fix;
  `bash hooks/git-workflow-guard.test.sh` must end with `failures: 0`.
- After touching `.claude-plugin/*.json` or `hooks/hooks.json`: `claude plugin validate .`, then install from a local
  marketplace copy and check that `claude plugin list` shows it enabled (`validate` passes configs that fail to load).
- The guard uses only the stable hooks API. Anything on the early-access function-hooks API (`modules`) must fail
  without affecting the guard.
- Display changes (`hooks/register.tsx`, `hooks/display.ts`): `claude plugin test .` must pass. A changed field in a
  saved value gets a new `shape` tag, with a test that the old value is declined.
- Every change names its source in the PR: the Claude Code plugin or hooks docs, or a linked observed failure.
  No source: call it a proposal.

## Skill (`skills/git-workflow/SKILL.md`)
- Read on every run: keep a line only if the agent would act differently without it.
- No personal paths, names or account details in examples.
