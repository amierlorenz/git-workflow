import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Info, Panel } from '../types'
import {
  VERDICT_COLOR,
  count,
  folderOf,
  guardsText,
  modeColor,
  note,
  rules,
  rulesText,
  summary,
  verdictOf,
} from './display'

// Shows the session repo's mode, branch and this session's guard decisions, as a band above the prompt
// (style `band`) or at the end of the hint line (style `hint`). Early-access API: every hook passes the
// event on if it fails, so the guard (a plain command hook) never depends on it.

// Change a shape tag when that value's fields change: a reload keeps what an older version saved.
const info = atom({ plugin: 'git-workflow', key: 'info' } as const, null, { shape: 'info-1' })
const counts = atom({ plugin: 'git-workflow', key: 'counts' } as const, { allow: 0, ask: 0, deny: 0 }, { shape: 'counts-1' })
const decisions = atom({ plugin: 'git-workflow', key: 'decisions' } as const, [], { shape: 'decisions-1' })
const panel = atom({ plugin: 'git-workflow', key: 'panel' } as const, null)

function guard($: EngineInterface): string {
  return `${$.plugin.root}/hooks/git-workflow-guard.sh`
}

async function refresh($: EngineInterface) {
  const cwd = await $.session.cwd()
  const mode = (await $.process.run([guard($), '--mode', cwd])).stdout.trim()
  if (!mode) return update($, info, () => null)
  // symbolic-ref names an unborn branch too, as the guard reads it.
  const ref = await $.process.run(['git', '-C', cwd, 'symbolic-ref', '--short', '-q', 'HEAD'])
  const branch = ref.stdout.trim() || 'detached'
  const next: Info = { mode, branch, folder: folderOf(cwd) }
  await update($, info, () => next)
}

// The guard's own decision for a command: the hook input piped through the real script.
async function record($: EngineInterface, command: string) {
  const cwd = await $.session.cwd()
  const ran = await $.process.run([guard($)], { stdin: JSON.stringify({ tool_input: { command }, cwd }) })
  const verdict = verdictOf(ran.stdout)
  if (!verdict) return
  await update($, counts, c => count(c, verdict))
  const folder = folderOf(cwd)
  await update($, decisions, list => [...list, { verdict, folder, command: command.split('\n')[0] ?? '' }].slice(-20))
}

function toggle($: EngineInterface, which: Exclude<Panel, null>) {
  return update($, panel, open => (open === which ? null : which))
}

export const register: Register = (on, options) => {
  const isHint = options.style === 'hint'

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await update($, panel, () => null)
    await refresh($)
    return result
  })

  // `/git-workflow rules` and `/git-workflow guards` are answered here; anything else runs the setup skill.
  on('command.run', async ($, e, next) => {
    if (e.command !== 'git-workflow' && e.command !== 'git-workflow:git-workflow') return next(e)
    const arg = e.args.trim()
    if (arg === 'guards') return { text: guardsText(await read($, decisions)) }
    if (arg !== 'rules') return next(e)
    const now = await read($, info)
    return { text: now ? rulesText(now) : 'Not in a git repo.' }
  }).catch(($, e, next) => next(e))

  // A prompt covers mode changes made outside the session.
  on('prompt.submit', async ($, e, next) => {
    await refresh($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    await record($, e.command)
    const result = await next(e)
    // The session's cwd moves only after this hook returns (a plugin's CwdChanged hook never fires),
    // so refresh from a timer, which reads the new directory.
    $.clock.after(0, () => void refresh($))
    return result
  }).catch(($, e, next) => next(e))

  // The hint line's `tail` is plain text, so colored counts take a tree of our own; the engine's pills
  // keep their words but lose their own colors and clicks.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const now = await read($, info)
    if (!isHint || !now) return next(e)
    const { Text } = $.ui.resolve(e)
    const c = await read($, counts)
    return (
      <Text wrap="truncate-end">
        <Text dimColor>{e.props.hint} · {summary(now)} · </Text>
        <Text color="green">✓{c.allow}</Text> <Text color="yellow">?{c.ask}</Text>
        {c.deny > 0 && <Text color="red"> ✗{c.deny}</Text>}
      </Text>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, info)
    if (isHint || !now || e.props.hasSurvey) return next(e)
    // Other plugins share the band: draw theirs below ours instead of replacing it.
    const below = await next(e).catch(() => undefined)
    const { Box, Button, Text } = $.ui.resolve(e)
    const c = await read($, counts)
    const open = await read($, panel)
    const list = await read($, decisions)
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
            <Button key="guards" plain label="guards" onPress={() => toggle($, 'guards')} />
            <Text>   </Text>
            <Button key="rules" plain label={open === 'rules' ? 'hide rules' : 'show rules'} onPress={() => toggle($, 'rules')} />
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
                <Text color={VERDICT_COLOR[d.verdict]}>  {d.verdict.padEnd(5)}</Text>
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
  }).catch(($, e, next) => next(e))
}
