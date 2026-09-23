const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0

function flagValue(argv, flag) {
  const index = argv.indexOf(flag)
  if (index < 0 || index === argv.length - 1) return undefined
  if (argv.indexOf(flag, index + 1) >= 0) return undefined
  return argv[index + 1]
}

export function matchesRunnerArguments(argv, port, profile) {
  return (
    Array.isArray(argv) &&
    flagValue(argv, '--port') === String(port) &&
    flagValue(argv, '--profile') === profile
  )
}

export function decidePortOwnership(state, processInfo, listenerPid, requestedPort) {
  if (listenerPid == null) return 'idle'
  return isOwnedRunnerProcess(state, processInfo, requestedPort) && listenerPid === state.pid
    ? 'owned'
    : 'conflict'
}

export function isOwnedRunnerProcess(state, processInfo, requestedPort) {
  if (!state || !processInfo || !Array.isArray(processInfo.argv)) return false
  if (!isPositiveInteger(state.pid) || !isPositiveInteger(processInfo.pid)) return false
  if (!isPositiveInteger(state.port) || !isPositiveInteger(requestedPort)) return false
  if (typeof state.profile !== 'string' || state.profile.length === 0) return false
  if (typeof state.processStartedAt !== 'string' || state.processStartedAt.length === 0)
    return false
  if (state.pid !== processInfo.pid || state.port !== requestedPort) return false
  if (state.processStartedAt !== processInfo.startedAt) return false
  return matchesRunnerArguments(processInfo.argv, state.port, state.profile)
}

/** Parse Windows CommandLineToArgvW-style quoting without substring matching. */
export function parseWindowsCommandLine(commandLine) {
  const argv = []
  let index = 0
  while (index < commandLine.length) {
    while (/[\t ]/.test(commandLine[index] ?? '')) index += 1
    if (index >= commandLine.length) break
    let argument = ''
    let quoted = false
    while (index < commandLine.length) {
      if (!quoted && /[\t ]/.test(commandLine[index])) break
      let slashes = 0
      while (commandLine[index] === '\\') {
        slashes += 1
        index += 1
      }
      if (commandLine[index] === '"') {
        argument += '\\'.repeat(Math.floor(slashes / 2))
        if (slashes % 2 === 1) {
          argument += '"'
          index += 1
        } else if (quoted && commandLine[index + 1] === '"') {
          argument += '"'
          index += 2
        } else {
          quoted = !quoted
          index += 1
        }
      } else {
        argument += '\\'.repeat(slashes)
        if (index < commandLine.length && (quoted || !/[\t ]/.test(commandLine[index]))) {
          argument += commandLine[index]
          index += 1
        }
      }
    }
    argv.push(argument)
    while (/[\t ]/.test(commandLine[index] ?? '')) index += 1
  }
  return argv
}

/** Conservative parser for `ps -o command=` output; unsupported quoting fails closed downstream. */
export function parsePosixCommandLine(commandLine) {
  const argv = []
  let argument = ''
  let quote = null
  let escaped = false
  for (const character of commandLine.trim()) {
    if (escaped) {
      argument += character
      escaped = false
    } else if (character === '\\' && quote !== "'") {
      escaped = true
    } else if (
      (character === '"' || character === "'") &&
      (quote === null || quote === character)
    ) {
      quote = quote === null ? character : null
    } else if (/\s/.test(character) && quote === null) {
      if (argument.length > 0) argv.push(argument)
      argument = ''
    } else {
      argument += character
    }
  }
  if (escaped || quote !== null) return []
  if (argument.length > 0) argv.push(argument)
  return argv
}
