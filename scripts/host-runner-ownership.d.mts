export interface RunnerState {
  pid: number
  port: number
  profile: string
  processStartedAt?: string
  startedAt?: string
  tokenUrl?: string
  token?: string
  cookie?: string
  logFile?: string
  status?: string
}

export interface ProcessInfo {
  pid: number
  startedAt: string
  argv: string[]
}

export type PortOwnershipKind = 'idle' | 'owned' | 'conflict'

export function matchesRunnerArguments(
  argv: string[] | undefined | null,
  port: number,
  profile: string,
): boolean

export function decidePortOwnership(
  state: RunnerState | null | undefined,
  processInfo: ProcessInfo | null | undefined,
  listenerPid: number | null | undefined,
  requestedPort: number,
): PortOwnershipKind

export function isOwnedRunnerProcess(
  state: RunnerState | null | undefined,
  processInfo: ProcessInfo | null | undefined,
  requestedPort: number,
): boolean

export function parseWindowsCommandLine(commandLine: string): string[]
export function parsePosixCommandLine(commandLine: string): string[]
