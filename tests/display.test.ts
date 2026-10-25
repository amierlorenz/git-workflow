import { describe, expect, test } from 'claude-code/testing'

import { count, folderOf, guardsText, rules, rulesText, verdictOf } from '../hooks/display'

describe('rules', () => {
  test('pr mode allows feature branches, asks on main, never merges or force-pushes', () => {
    expect(rules('pr').map(r => [r.where, r.verdict])).toEqual([
      ['feature branch', 'allow'],
      ['main', 'ask'],
      ['anywhere', 'never'],
    ])
  })

  test('hands-on and unset ask everywhere; pr without the marker blocks', () => {
    expect(rules('hands-on')[0]?.verdict).toBe('ask')
    expect(rules('unset')[0]?.verdict).toBe('ask')
    expect(rules('pr (no CLAUDE.md marker)')[0]?.verdict).toBe('never')
  })

  test('the text form names the setup step where one is needed', () => {
    const info = { mode: 'unset', folder: 'app', branch: 'main' }
    expect(rulesText(info)).toContain('unset · app · main')
    expect(rulesText(info)).toContain('Run /git-workflow')
    expect(rulesText({ ...info, mode: 'pr' })).not.toContain('/git-workflow')
  })
})

describe('guard decisions', () => {
  const hook = (d: string) => JSON.stringify({ hookSpecificOutput: { permissionDecision: d } })

  test('reads the decision the guard printed, and nothing for ignored commands', () => {
    expect(verdictOf(hook('allow'))).toBe('allow')
    expect(verdictOf(hook('deny'))).toBe('deny')
    expect(verdictOf('')).toBeNull()
    expect(verdictOf('not json')).toBeNull()
    expect(verdictOf(hook('maybe'))).toBeNull()
  })

  test('counts each verdict', () => {
    const c = count(count({ allow: 0, ask: 0, deny: 0 }, 'allow'), 'ask')
    expect(c).toEqual({ allow: 1, ask: 1, deny: 0 })
  })

  test('lists decisions, or says there are none', () => {
    expect(guardsText([])).toBe('No guard decisions yet this session.')
    expect(guardsText([{ verdict: 'deny', folder: 'app', command: 'gh pr merge 1' }])).toContain('deny')
  })

  test('names the folder from a path', () => {
    expect(folderOf('/Users/me/app')).toBe('app')
    expect(folderOf('/Users/me/app/')).toBe('app')
  })
})
