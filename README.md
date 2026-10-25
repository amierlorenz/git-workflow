# git-workflow

Pick a git workflow per repo and have a hook enforce it on every `git commit`, `git push` and `gh pr create`:

- **hands-on**: you're at the keyboard. Every commit, push and PR waits for your yes. Also the rule when no mode is set.
- **pr**: Claude works on a feature branch, commits and pushes freely there, opens PRs, and asks before touching `main`.

In both modes `gh pr merge` and force-pushes are denied.

```
/plugin install git-workflow@amierlorenz
/git-workflow          # pick the mode for the repo you're in
```

The mode lives in the repo's `.claude/settings.local.json` (`env.CLAUDE_GIT_WORKFLOW`). The hook reads it from the
repo the command targets (`git -C <dir>`, a leading `cd <dir> &&`, else the session's folder); in a worktree it falls
back to the main checkout's file. pr mode also needs the `git-workflow:pr` marker in the repo's `CLAUDE.md`, which
the setup skill writes.

The current mode shows under the prompt as `git: hands-on`, `git: pr` or `git: unset`. It updates after each Bash
command and each prompt. This uses Claude Code's function hooks (`hooks/register.ts`), an early-access API; the
guard itself is a plain command hook and doesn't depend on it.

## Developing

`bash hooks/git-workflow-guard.test.sh` runs the guard against throwaway repos and prints one line per case.

## Uninstall

`/plugin uninstall git-workflow@amierlorenz`. The plugin keeps no caches or config; each repo's mode stays in its
`.claude/settings.local.json`.
