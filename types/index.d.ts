export type Verdict = 'allow' | 'ask' | 'deny'
export type Info = { mode: string; folder: string; branch: string }
export type Counts = { allow: number; ask: number; deny: number }
export type Decision = { verdict: Verdict; folder: string; command: string }
export type Panel = 'rules' | 'guards' | null

declare module 'claude-code' {
  interface PluginState {
    'git-workflow': {
      info: Shaped<Info | null>
      counts: Shaped<Counts>
      decisions: Shaped<Decision[]>
      panel: Panel
    }
  }
}
