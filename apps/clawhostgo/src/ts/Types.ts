type ApiStatus = 'idle' | 'starting' | 'running' | 'error' | 'stopped'

type AppView = 'home' | 'settings'

type ClawProcessStatus =
    | 'running'
    | 'stopped'
    | 'starting'
    | 'stopping'
    | 'error'

export type { ApiStatus, AppView, ClawProcessStatus }