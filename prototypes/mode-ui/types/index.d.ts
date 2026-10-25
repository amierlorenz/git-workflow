export type Variant = 'A' | 'B' | 'C'
export type Info = { mode: string; folder: string; branch: string }
export type Counts = { allow: number; ask: number; deny: number }
export type Decision = { decision: 'allow' | 'ask' | 'deny'; command: string; folder: string }
export type Panel = 'rules' | 'guards' | null

declare module 'claude-code' {
  interface PluginState {
    'git-workflow-ui-prototype': {
      variant: Variant
      info: Info | null
      counts: Counts
      panel: Panel
      decisions: Decision[]
    }
  }
}
