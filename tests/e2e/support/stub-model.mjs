/**
 * tests/e2e/support/stub-model.mjs — Deterministic model at the host's adapter boundary.
 *
 * This is the ONLY substituted seam: `stream()` returns scripted blocks. Tools, storage, HTTP,
 * sessions, the agent loop and the session log all run for real, so an E2E failure points at our
 * code rather than at a mock that agreed with itself.
 *
 * `LlmAdapter` is imported from the host's own `dsh-llm` module, whose path arrives via
 * `DSH_RRP_E2E_LLM_MODULE`. That indirection is structural, not stylistic: this repository does not
 * depend on `dsh-llm`, and importing a second copy would give the host a class it cannot recognise.
 *
 * The plugin deliberately does not import Cordis — exporting `inject` + `apply` is the whole
 * contract, which also avoids a second Cordis instance inside the host process.
 */

import { appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { latestUserText, planBlocks } from './stub-plan.mjs'

/** Provider id the isolated profile selects as `agent-default-model`. */
export const STUB_PROVIDER = 'dsh-rrp-e2e'

const llmModule = process.env.DSH_RRP_E2E_LLM_MODULE
if (!llmModule) {
  throw new Error(
    'dsh-rrp E2E 模型桩缺少 DSH_RRP_E2E_LLM_MODULE：应由 tests/e2e/support/isolated-host.ts 注入宿主 dsh-llm 路径。',
  )
}
const { LlmAdapter } = await import(pathToFileURL(llmModule))

export const name = 'dsh-rrp-e2e-model-stub'
export const inject = ['llm']

/**
 * Count and record each entry into `stream()`.
 *
 * Why this matters: the host's default retry policy treats an empty response as retryable and will
 * call a silent adapter up to five times. Without the audit line, a stub that never finishes
 * properly still "passes" while quietly burning five attempts per turn.
 *
 * @param {unknown} payload one JSON line describing the call.
 */
async function audit(payload) {
  const file = process.env.DSH_RRP_E2E_AUDIT
  if (!file) return
  await appendFile(file, JSON.stringify(payload) + '\n')
}

export function apply(ctx) {
  class StubModel extends LlmAdapter {
    async resolveModel(provider, id) {
      return {
        provider,
        id,
        name: 'dsh-rrp E2E 桩模型',
        context: { contextWindow: 128_000 },
      }
    }

    async *stream(input) {
      const messages = Array.isArray(input?.messages) ? input.messages : []
      await audit({ at: 'stream-enter', call: messages.length })

      const blocks = planBlocks(latestUserText(messages))
      let outputChars = 0
      for (const [index, block] of blocks.entries()) {
        outputChars += block.text.length
        yield { type: 'block-start', index, blockType: block.type }
        // Real providers stream deltas before closing the block; consumers read the stream,
        // not the finished block, so the stub must not skip this step.
        yield { type: 'text-delta', index, text: block.text }
        yield { type: 'block-end', index, block }
      }

      // Deterministic by construction: derived from the scripted text itself, never from a clock
      // or a random id, so ticket 04's byte-equality assertions stay valid across runs.
      const inputChars = JSON.stringify(messages).length
      yield {
        type: 'usage',
        usage: {
          inputTokens: Math.ceil(inputChars / 3.2),
          outputTokens: Math.ceil(outputChars / 3.2),
        },
      }
      // `stop` closes the turn. Anything shorter (no finish, or an empty stream) is retried by the
      // host up to five times, which is the failure mode this whole file exists to avoid.
      yield { type: 'finish', reason: { kind: 'stop' } }
      await audit({ at: 'stream-finish', blocks: blocks.length })
    }
  }

  ctx.llm.registerAdapter([STUB_PROVIDER], new StubModel())
}
