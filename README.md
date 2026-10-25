# git-workflow

Pick a git workflow per repo and have a hook enforce it on every `git commit`, `git push` and `gh pr create`:

- **hands-on**: you're at the keyboard. Every commit, push and PR waits for your yes. Also the rule when no mode is set.
- **pr**: Claude works on a feature branch, commits and pushes freely there, opens PRs, and asks before touching `main`.

In both modes `gh pr merge` and force-pushes are denied.

In Claude Code (the plugin is listed in the [`amierlorenz/skills`](https://github.com/amierlorenz/skills) marketplace):

```
/plugin marketplace add amierlorenz/skills
/plugin install git-workflow@amierlorenz
/git-workflow          # pick the mode for the repo you're in
```

The mode lives in the repo's `.claude/settings.local.json` (`env.CLAUDE_GIT_WORKFLOW`). The hook reads it from the
repo the command targets (`git -C <dir>`, a leading `cd <dir> &&`, else the session's folder); a worktree without its
own mode uses the main checkout's. pr mode also needs the `git-workflow:pr` marker in the repo's `CLAUDE.md`, which
the setup skill writes.

`hooks/git-workflow-guard.sh --mode <dir>` prints the mode for a folder: `pr`, `hands-on`, `unset`, or
`pr (no CLAUDE.md marker)`.

## Mode display

A band above the prompt shows the session repo's mode, folder and branch, and how many commands the guard allowed
(✓), asked about (?) and denied (✗) this session:

```
pr · my-app · feat/12-search   ✓ 3  ? 1                                  guards   show rules
```

`guards` lists the recent decisions and `show rules` what the mode allows, asks and never does. 
`/git-workflow rules` and `/git-workflow guards` print the same as text (`/git-workflow` or `/git-workflow setup` runs setup).

The **Mode display** setting picks where it shows: `band` (the default) or `hint`, a one-line summary at the end of
the hint line under the prompt. Change it with `/plugin configure git-workflow@amierlorenz`.

The display uses Claude Code's early-access function hooks (`hooks/register.tsx`). The guard is a plain command hook
and works without it.

## Developing

- `bash hooks/git-workflow-guard.test.sh` runs the guard against throwaway repos and prints one line per case.
- `claude plugin test .` runs the display's tests (`tests/`).

## Uninstall

`/plugin uninstall git-workflow@amierlorenz`. The plugin keeps no caches or config; each repo's mode stays in its
`.claude/settings.local.json`.
