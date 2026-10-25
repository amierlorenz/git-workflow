import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

const BAND = {
  plugin: 'git-workflow',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const HINT = {
  plugin: 'git-workflow',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

// Nothing sits beneath the plugin: these hooks stand for the engine, the guard script and git.
function engine(on: On, mode = 'pr') {
  const ran = (stdout: string) => ({
    value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  })
  on('session.cwd', () => ({ value: '/work/app' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('process.run', (_, e) => {
    if (e.argv.includes('--mode')) return ran(`${mode}\n`)
    if (e.argv[0] === 'git') return ran('feat/7-band\n')
    const command: string = JSON.parse(e.init?.stdin ?? '{}').tool_input?.command ?? ''
    const decision = command.startsWith('git commit') ? 'allow' : command.startsWith('git push') ? 'ask' : ''
    return ran(decision && JSON.stringify({ hookSpecificOutput: { permissionDecision: decision } }))
  })
}

test('the band shows mode, folder, branch and the guard counts, on terminal and desktop', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: x"' })
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  await $.tool.call({ tool: 'Bash', command: 'git status' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /app · feat\/7-band/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✓ 1' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '? 1' })).toBeDefined()

    await ui.press({ key: 'guards' })
    expect(await ui.find({ type: 'Text', text: / git push origin main/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: / git status/ })).toBeUndefined()

    await ui.press({ key: 'rules' })
    expect(await ui.find({ type: 'Text', text: /feature branch/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: / git push origin main/ })).toBeUndefined()
    await ui.press({ key: 'rules' })
    await ui.unmount()
  }
})

test('/git-workflow rules and guards answer from the display; anything else runs setup', async ($, on) => {
  engine(on)
  // Beneath the plugin: stands for the setup skill.
  on('command.run', () => ({ text: 'setup skill' }))
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })

  const run = async (command: string, args: string) =>
    (
      await $.command.run({
        command,
        args,
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 100 },
      })
    ).text

  for (const command of ['git-workflow', 'git-workflow:git-workflow']) {
    expect(await run(command, 'rules')).toContain('main            commit, push, PR: ask')
    expect(await run(command, ' guards ')).toContain('git push origin main')
    expect(await run(command, '')).toBe('setup skill')
    expect(await run(command, 'setup')).toBe('setup skill')
  }
  expect(await run('other', 'rules')).toBe('setup skill')
})

test("another plugin's band is drawn below, not replaced", async ($, on) => {
  engine(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other band</Text>
  })
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'other band' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /app · feat\/7-band/ })).toBeDefined()
  await ui.unmount()
})

test('style hint puts the summary on the hint line and leaves the band alone', { options: { style: 'hint' } }, async ($, on) => {
  engine(on, 'hands-on')
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })

  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await hint.find({ type: 'Text', text: /\? for shortcuts · hands-on · app · feat\/7-band/ })).toBeDefined()
  await hint.unmount()

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text' }))?.text).toBe('engine')
  await band.unmount()
})

test('decisions saved by an older version are declined, not drawn', async ($, on) => {
  engine(on)
  // What a version before the `decisions-1` shape saved: `decision`, no `verdict` or `folder`.
  on('state.get', (_, e, next) =>
    e.key === 'decisions' ? { value: { value: [{ decision: 'allow', command: 'x' }], version: 1 } } : next(e),
  )
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'guards' })
  expect(await ui.find({ type: 'Text', text: /No guard decisions yet/ })).toBeDefined()
  await ui.unmount()
})
