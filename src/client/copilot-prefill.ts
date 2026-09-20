/**
 * dsh-rrp — the stage → copilot hand-off (issue #18).
 *
 * `ask_copilot` is one of the only two things card UI may do. The copilot panel
 * owns its input as local state, so a question raised from another panel rides
 * this one-shot bus instead of reaching into that component. It survives the
 * panel being unmounted: the question waits until the player opens 副驾驶.
 */
import { useEffect } from 'react'

let pending: string | undefined
const listeners = new Set<() => void>()

/** Hand one question to the copilot input (never auto-sent). */
export function askCopilot(question: string): void {
  pending = question
  for (const listener of listeners) listener()
}

/** Consume the pending question into the copilot's input, then and on arrival. */
export function useCopilotPrefill(setInput: (value: string) => void): void {
  useEffect(() => {
    const take = (): void => {
      if (pending === undefined) return
      setInput(pending)
      pending = undefined
    }
    listeners.add(take)
    take()
    return () => {
      listeners.delete(take)
    }
  }, [setInput])
}
