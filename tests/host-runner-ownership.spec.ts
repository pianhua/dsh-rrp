import { describe, expect, it } from 'vitest'
import {
  decidePortOwnership,
  isOwnedRunnerProcess,
  parsePosixCommandLine,
  parseWindowsCommandLine,
} from '../scripts/host-runner-ownership.mjs'

const state = {
  pid: 2400,
  port: 3099,
  profile: 'rp-dev',
  processStartedAt: '2026-09-23T08:00:00.000Z',
}
const processInfo = {
  pid: 2400,
  startedAt: '2026-09-23T08:00:00.000Z',
  argv: [
    'C:/Program Files/node.exe',
    'C:/dsh/lib/bin.js',
    '--profile',
    'rp-dev',
    '--port',
    '3099',
    '--no-open',
  ],
}

describe('host-runner process ownership', () => {
  it('classifies an empty port as idle and any unowned listener as a conflict', () => {
    expect(decidePortOwnership(null, null, null, 3099)).toBe('idle')
    expect(decidePortOwnership(state, processInfo, 2500, 3099)).toBe('conflict')
    expect(decidePortOwnership(state, { ...processInfo, pid: 2500 }, 2500, 3099)).toBe('conflict')
    expect(decidePortOwnership(state, processInfo, 2400, 3099)).toBe('owned')
  })

  it('accepts a live process only when persisted identity and exact arguments match', () => {
    expect(isOwnedRunnerProcess(state, processInfo, 3099)).toBe(true)
  })

  it('rejects a reused PID even when it runs a DSH process with the same profile and port', () => {
    expect(
      isOwnedRunnerProcess(state, { ...processInfo, startedAt: '2026-09-23T09:00:00.000Z' }, 3099),
    ).toBe(false)
  })

  it('rejects a listener PID that differs from the recorded runner PID', () => {
    expect(isOwnedRunnerProcess(state, { ...processInfo, pid: 2401 }, 3099)).toBe(false)
  })

  it('rejects stale or malformed metadata and mismatched requested port', () => {
    expect(isOwnedRunnerProcess({ ...state, pid: 0 }, processInfo, 3099)).toBe(false)
    expect(isOwnedRunnerProcess({ ...state, profile: '' }, processInfo, 3099)).toBe(false)
    expect(isOwnedRunnerProcess(state, processInfo, 3100)).toBe(false)
  })

  it('does not accept profile/port as substrings in unrelated arguments', () => {
    expect(
      isOwnedRunnerProcess(
        state,
        {
          ...processInfo,
          argv: ['node', 'unrelated.js', 'rp-dev', '3099', '--not-profile', '--not-port'],
        },
        3099,
      ),
    ).toBe(false)
  })

  it('accepts flags in either order but requires exact option/value pairs', () => {
    expect(
      isOwnedRunnerProcess(
        state,
        {
          ...processInfo,
          argv: ['node', 'dsh.js', '--port', '3099', '--profile', 'rp-dev'],
        },
        3099,
      ),
    ).toBe(true)
    expect(
      isOwnedRunnerProcess(
        state,
        {
          ...processInfo,
          argv: ['node', 'dsh.js', '--port', '3099x', '--profile', 'rp-dev'],
        },
        3099,
      ),
    ).toBe(false)
  })

  it('parses Windows command lines with spaces and quotes faithfully', () => {
    const parsed = parseWindowsCommandLine(
      '"C:\\Program Files\\nodejs\\node.exe" "C:\\dsh\\bin.js" --profile rp-dev --port 3099 --extra "a \\"quoted\\" val"',
    )
    expect(parsed).toEqual([
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\dsh\\bin.js',
      '--profile',
      'rp-dev',
      '--port',
      '3099',
      '--extra',
      'a "quoted" val',
    ])
  })

  it('parses POSIX command lines with single and double quotes', () => {
    const parsed = parsePosixCommandLine(
      "/usr/bin/node '/opt/dsh/bin.js' --profile 'rp-dev' --port 3099 --note \"hello world\"",
    )
    expect(parsed).toEqual([
      '/usr/bin/node',
      '/opt/dsh/bin.js',
      '--profile',
      'rp-dev',
      '--port',
      '3099',
      '--note',
      'hello world',
    ])
  })

  it('fails closed on unclosed POSIX command lines', () => {
    expect(parsePosixCommandLine('node script.js "unclosed string')).toEqual([])
  })
})
