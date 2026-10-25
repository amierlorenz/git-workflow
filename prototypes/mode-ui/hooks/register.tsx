import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Counts, Decision, Info, Panel, Variant } from '../types'

// PROTOTYPE, throw away. Question: where and how should the git workflow mode show in Claude Code's UI?
// The `style` option (/config) picks band (C) or hint (B); `/gw-ui [A|B|C|next|prev]` overrides it until
// the next reload. `/gw-rules` and `/gw-guards` print the rules and this session's guard decisions.

// The real guard, from this repo's plugin, so the prototype can't disagree with it.
function guard($: EngineInterface): string {
  return `${$.plugin.root}/../../hooks/git-workflow-guard.sh`
}
const VARIANTS: Variant[] = ['A', 'B', 'C']
const NAMES: Record<Variant, string> = {
  A: 'status entry under the prompt',
  B: 'hint line under the prompt',
  C: 'band above the prompt',
}

const variant = atom({ plugin: 'git-workflow-ui-prototype', key: 'variant' } as const, 'C')
const info = atom({ plugin: 'git-workflow-ui-prototype', key: 'info' } as const, null)
const counts = atom({ plugin: 'git-workflow-ui-prototype', key: 'counts' } as const, { allow: 0, ask: 0, deny: 0 })
const panel = atom({ plugin: 'git-workflow-ui-prototype', key: 'panel' } as const, null)
// Not `log`: an earlier version stored entries without `folder` there, and state outlives a reload.
const log = atom({ plugin: 'git-workflow-ui-prototype', key: 'decisions' } as const, [])

type Rule = { where: string; actions: string[]; verdict: 'allow' | 'ask' | 'never' }

function rules(mode: string): Rule[] {
  const never: Rule = { where: 'anywhere', actions: ['merge', 'force-push'], verdict: 'never' }
  const all = ['commit', 'push', 'PR']
  if (mode === 'pr')
    return [
      { where: 'feature branch', actions: all, verdict: 'allow' },
      { where: 'main', actions: all, verdict: 'ask' },
      never,
    ]
  // pr without the CLAUDE.md marker: the guard denies until setup adds it.
  if (mode.startsWith('pr ')) return [{ where: 'any branch', actions: all, verdict: 'never' }, never]
  return [{ where: 'any branch', actions: all, verdict: 'ask' }, never]
}

function note(mode: string): string | undefined {
  if (mode === 'unset') return 'No mode set, so every commit asks. Run /git-workflow to pick one.'
  if (mode.startsWith('pr ')) return 'Blocked until /git-workflow adds the git-workflow:pr marker to CLAUDE.md.'
}

const VERDICT_COLOR = { allow: 'green', ask: 'yellow', never: 'red', deny: 'red' } as const

function modeColor(mode: string): string {
  return mode === 'pr' ? 'green' : mode === 'hands-on' ? 'yellow' : mode === 'unset' ? 'gray' : 'red'
}

function line(now: Info, c: Counts): string {
  return `${now.mode} · ${now.folder} · ${now.branch} · ✓${c.allow} ?${c.ask}${c.deny ? ` ✗${c.deny}` : ''}`
}

async function refresh($: EngineInterface) {
  const cwd = await $.session.cwd()
  const mode = (await $.process.run([guard($), '--mode', cwd])).stdout.trim()
  const branch = (await $.process.run(['git', '-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
  const next: Info | null = mode ? { mode, branch, folder: cwd.split('/').pop() ?? cwd } : null
  await update($, info, () => next)
  await paintStatus($)
}

// Variant A is the only one drawn outside ui.render, so it repaints by hand.
async function paintStatus($: EngineInterface) {
  const now = await read($, info)
  const isA = (await read($, variant)) === 'A'
  $.ui.status(isA && now ? line(now, await read($, counts)) : undefined)
}

// The guard's own verdict for a command, by piping the hook input through the real script.
async function tally($: EngineInterface, command: string) {
  const cwd = await $.session.cwd()
  const ran = await $.process.run([guard($)], { stdin: JSON.stringify({ tool_input: { command }, cwd }) })
  if (!ran.stdout.trim()) return
  const decision: string = JSON.parse(ran.stdout).hookSpecificOutput.permissionDecision
  if (decision !== 'allow' && decision !== 'ask' && decision !== 'deny') return
  await update($, counts, c => ({ ...c, [decision]: c[decision] + 1 }))
  const entry: Decision = { decision, command: command.split('\n')[0] ?? command, folder: cwd.split('/').pop() ?? cwd }
  await update($, log, list => [...list, entry].slice(-20))
}

function togglePanel($: EngineInterface, which: Exclude<Panel, null>) {
  return update($, panel, open => (open === which ? null : which))
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await update($, variant, () => (options.style === 'hint' ? 'B' : 'C'))
    await update($, panel, () => null)
    await $.command.register({ name: 'gw-ui', description: 'PROTOTYPE: switch where the git mode shows (A, B, C, next, prev)' })
    await $.command.register({ name: 'gw-rules', description: 'PROTOTYPE: what the current git mode allows, asks and never does' })
    await $.command.register({ name: 'gw-guards', description: "PROTOTYPE: this session's guard decisions" })
    await refresh($)
    return result
  })

  on('command.run', { command: 'gw-ui' }, async ($, e) => {
    const arg = String(e.args ?? '').trim().toUpperCase()
    const at = VARIANTS.indexOf(await read($, variant))
    const v = (VARIANTS as string[]).includes(arg)
      ? (arg as Variant)
      : VARIANTS[(at + (arg === 'PREV' ? VARIANTS.length - 1 : 1)) % VARIANTS.length]!
    await update($, variant, () => v)
    await paintStatus($)
    return { text: `Variant ${v}: ${NAMES[v]}. Others: ${VARIANTS.filter(x => x !== v).join(', ')}.` }
  })

  on('command.run', { command: 'gw-rules' }, async $ => {
    const now = await read($, info)
    if (!now) return { text: 'Not in a git repo.' }
    const rows = rules(now.mode).map(r => `  ${r.where.padEnd(15)} ${r.actions.join(', ')}: ${r.verdict}`)
    const extra = note(now.mode)
    return { text: [`${now.mode} · ${now.folder} · ${now.branch}`, ...rows, ...(extra ? [extra] : [])].join('\n') }
  })

  on('command.run', { command: 'gw-guards' }, async $ => {
    const list = await read($, log)
    if (list.length === 0) return { text: 'No guard decisions yet this session.' }
    return { text: list.map(d => `  ${d.decision.padEnd(5)}  ${d.folder.padEnd(14)} ${d.command}`).join('\n') }
  })

  on('prompt.submit', async ($, e, next) => {
    await refresh($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    await tally($, e.command)
    const result = await next(e)
    // The session's cwd moves only after this hook returns, so refresh from a timer.
    $.clock.after(0, () => void refresh($))
    return result
  }).catch(($, e, next) => next(e))

  // Colored counts need a tree of our own, which replaces the engine's line: its pills keep their
  // text but lose their own colors and clicks.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const now = await read($, info)
    if ((await read($, variant)) !== 'B' || !now) return next(e)
    const { Text } = $.ui.resolve(e)
    const c = await read($, counts)
    return (
      <Text wrap="truncate-end">
        <Text dimColor>{e.props.hint} · {now.mode} · {now.folder} · {now.branch} · </Text>
        <Text color="green">✓{c.allow}</Text> <Text color="yellow">?{c.ask}</Text>
        {c.deny > 0 && <Text color="red"> ✗{c.deny}</Text>}
      </Text>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, info)
    if ((await read($, variant)) !== 'C' || !now || e.props.hasSurvey) return next(e)
    // Other plugins share the band (ponytail): draw theirs below ours instead of replacing it.
    const below = await next(e).catch(() => undefined)
    const { Box, Button, Text } = $.ui.resolve(e)
    const c = await read($, counts)
    const open = await read($, panel)
    const list = await read($, log)
    const extra = note(now.mode)
    const mine = (
      <Box flexDirection="column">
        <Box justifyContent="space-between" width={e.props.bodyColumns}>
          <Text>
            <Text bold color={modeColor(now.mode)}>{now.mode}</Text>
            <Text dimColor> · {now.folder} · {now.branch}   </Text>
            <Text color="green">✓ {c.allow}</Text>
            <Text>  </Text>
            <Text color="yellow">? {c.ask}</Text>
            {c.deny > 0 && <Text color="red">  ✗ {c.deny}</Text>}
          </Text>
          <Box>
            <Button key="guards" plain label="guards" onPress={() => togglePanel($, 'guards')} />
            <Text>   </Text>
            <Button key="rules" plain label={open === 'rules' ? 'hide rules' : 'show rules'} onPress={() => togglePanel($, 'rules')} />
          </Box>
        </Box>
        {open === 'rules' && (
          <Box flexDirection="column">
            {rules(now.mode).map(r => (
              <Text>
                <Text dimColor>  {r.where.padEnd(15)}</Text>
                <Text color={VERDICT_COLOR[r.verdict]}>{r.actions.join('  ')}</Text>
              </Text>
            ))}
            {extra && <Text dimColor>  {extra}</Text>}
          </Box>
        )}
        {open === 'guards' && (
          <Box flexDirection="column">
            {list.length === 0 && <Text dimColor>  No guard decisions yet this session.</Text>}
            {list.slice(-8).map(d => (
              <Text wrap="truncate-end">
                <Text color={VERDICT_COLOR[d.decision]}>  {d.decision.padEnd(5)}</Text>
                <Text dimColor>  {d.folder.padEnd(14)}</Text>
                <Text> {d.command}</Text>
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )
    return below ? (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    ) : (
      mine
    )
  })
}
