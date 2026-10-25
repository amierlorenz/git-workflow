import type { EngineInterface, Register } from 'claude-code'

// Shows the git workflow mode of the repo the session is in, as the guard resolves it.
async function show($: EngineInterface, cwd?: string) {
  try {
    const guard = `${$.plugin.root}/hooks/git-workflow-guard.sh`
    const { stdout } = await $.process.run([guard, '--mode', cwd ?? (await $.session.cwd())])
    const mode = stdout.trim()
    $.ui.status(mode ? `git: ${mode}` : undefined)
  } catch {
    $.ui.status(undefined)
  }
}

// Bash covers a cd and the setup skill writing the mode; a prompt covers edits made outside the session.
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await show($)
    return result
  })
  // The indicator never blocks: a failed hook passes the prompt or call on untouched.
  on('prompt.submit', async ($, e, next) => {
    await show($)
    return next(e)
  }).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    await show($)
    return result
  }).catch(($, e, next) => next(e))
  // The session's cwd moves after the Bash call that cd'd, so redraw from the event's new directory.
  on('classic.CwdChanged', async ($, e, next) => {
    const result = await next(e)
    await show($, e.new_cwd)
    return result
  }).catch(($, e, next) => next(e))
}
