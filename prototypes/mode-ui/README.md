# PROTOTYPE: git workflow mode display

Throwaway. This branch is the record of the UI prototype for #1; it is never merged. The guard ships in #6 (moved from amierlorenz/skills#12).

**Question:** where and how should the git workflow mode show in Claude Code's UI?

## Variants tried
| Key | Where | Verdict |
|---|---|---|
| A | `$.ui.status` entry under the prompt | Dropped: the engine always draws it yellow with ⚠ and the plugin name (`⚠ git-workflow: …`), which reads as a warning. |
| B | The hint line under the prompt (`PromptHint`) | Kept as an option (`style: hint`). The engine's `tail` is plain dim text, so colored counts need an own tree, which costs the engine's pill colors and clicks; the engine also hands the line over as text joined by ` · `. |
| C | Band above the prompt (`AbovePrompt`) | **Chosen** (`style: band`, default). |
| D | Docked pane | Dropped: too heavy for one line of state. |
| E | Notices under each git command | Dropped: noisy. |

## Decisions for the real build
- Line: `mode · folder · branch   ✓ allowed  ? asked  ✗ denied` (✗ only when non-zero), mode colored.
- Right-aligned buttons: `guards` (last 8 decisions, verdict colored) and `show rules` / `hide rules`. One panel open at a time. No hotkey labels.
- Rules grouped by where they apply (`feature branch`, `main`, `anywhere`), actions colored by verdict; no color key line.
- A `style` plugin option (`band` | `hint`), set at install and in `/config`. `hint` gets `/…-rules` and `/…-guards` commands since it has no buttons.
- Stack other plugins' bands under ours (`await next(e)`), or ponytail's band disappears.
- Redraw from `$.clock.after(0, …)` after each Bash call: the session's cwd moves only after the `tool.call` hook returns, and a plugin's `CwdChanged` hook never fires.
- Tag each `$.state` value's shape: a stale `log` entry without `folder` crashed the band and kept it hidden across reloads.
- Counts come from piping each Bash command through the guard script (`git-workflow-guard.sh` with the hook JSON on stdin), so the UI can't disagree with the guard.

## Follow-ups
#2 (configurable rules, free / hands-on naming), #3 (reset guards button), #4 (optional attribution step), #5 (numbered rules).

## Run it
`bash prototypes/mode-ui/make-sandbox.sh` builds a sandbox of repos in each mode (`~/Developer/learning/git-workflow-sandbox`).
From the sandbox root, `claude --plugin-dir <repo>/prototypes/mode-ui`, then switch with `/gw-ui A|B|C`.
Both use this repo's guard script.
