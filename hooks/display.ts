import type { Counts, Decision, Info, Verdict } from '../types'

export type Rule = { where: string; actions: string[]; verdict: 'allow' | 'ask' | 'never' }

// What each mode does, as hooks/git-workflow-guard.sh enforces it.
export function rules(mode: string): Rule[] {
  const all = ['commit', 'push', 'PR']
  const never: Rule = { where: 'anywhere', actions: ['merge', 'force-push'], verdict: 'never' }
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

export function note(mode: string): string | undefined {
  if (mode === 'unset') return 'No mode set, so every commit asks. Run /git-workflow to pick one.'
  if (mode.startsWith('pr ')) return 'Blocked until /git-workflow adds the git-workflow:pr marker to CLAUDE.md.'
}

export const VERDICT_COLOR = { allow: 'green', ask: 'yellow', never: 'red', deny: 'red' } as const

export function modeColor(mode: string): string {
  return mode === 'pr' ? 'green' : mode === 'hands-on' ? 'yellow' : mode === 'unset' ? 'gray' : 'red'
}

export function folderOf(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

export function summary(info: Info): string {
  return `${info.mode} · ${info.folder} · ${info.branch}`
}

// The guard prints nothing for commands it ignores, else the hook JSON with its decision.
export function verdictOf(stdout: string): Verdict | null {
  if (!stdout.trim()) return null
  try {
    const decision = JSON.parse(stdout)?.hookSpecificOutput?.permissionDecision
    return decision === 'allow' || decision === 'ask' || decision === 'deny' ? decision : null
  } catch {
    return null
  }
}

export function count(counts: Counts, verdict: Verdict): Counts {
  return { ...counts, [verdict]: counts[verdict] + 1 }
}

export function rulesText(info: Info): string {
  const rows = rules(info.mode).map(r => `  ${r.where.padEnd(15)} ${r.actions.join(', ')}: ${r.verdict}`)
  const extra = note(info.mode)
  return [summary(info), ...rows, ...(extra ? [`  ${extra}`] : [])].join('\n')
}

export function guardsText(decisions: Decision[]): string {
  if (decisions.length === 0) return 'No guard decisions yet this session.'
  return decisions.map(d => `  ${d.verdict.padEnd(5)}  ${d.folder.padEnd(14)} ${d.command}`).join('\n')
}
