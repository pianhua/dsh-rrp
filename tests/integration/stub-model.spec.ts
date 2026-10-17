import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveDshScope } from '../../scripts/host-runtime.mjs'
import { AUTHOR_GOLD, AUTHOR_MARKER, CALLER_SIGNATURES } from '../e2e/support/stub-plan.mjs'

/**
 * Ticket 02: the stub must satisfy the host's stream contract exactly.
 *
 * It is loaded dynamically because the plugin resolves `LlmAdapter` from `DSH_RRP_E2E_LLM_MODULE`
 * at module scope — a static import would evaluate before the test can point it at the host.
 */

interface StubAdapter {
  stream(input: unknown): AsyncIterable<Record<string, unknown>>
  resolveModel(provider: string, id: string): Promise<Record<string, unknown>>
}

const repoRoot = join(import.meta.dirname, '../..')
let auditDir = ''
let StubProvider = ''
let applyStub: (ctx: {
  llm: { registerAdapter: (providers: string[], adapter: unknown) => unknown }
}) => void

beforeAll(async () => {
  const scope = resolveDshScope(repoRoot)
  if (scope === null) {
    throw new Error('未找到宿主 dsh-llm：请先安装 HOST_BASELINE.md 锁定的基线宿主。')
  }
  process.env.DSH_RRP_E2E_LLM_MODULE = join(scope, 'dsh-llm', 'lib', 'index.js')
  auditDir = mkdtempSync(join(tmpdir(), 'dsh-rrp-stub-audit-'))
  process.env.DSH_RRP_E2E_AUDIT = join(auditDir, 'calls.jsonl')
  const stub = await import('../e2e/support/stub-model.mjs')
  StubProvider = stub.STUB_PROVIDER
  applyStub = stub.apply
})

afterAll(() => {
  delete process.env.DSH_RRP_E2E_LLM_MODULE
  delete process.env.DSH_RRP_E2E_AUDIT
  if (auditDir) rmSync(auditDir, { recursive: true, force: true })
})

function register(): StubAdapter {
  let captured: unknown
  applyStub({
    llm: {
      registerAdapter: (providers, adapter) => {
        expect(providers).toEqual([StubProvider])
        captured = adapter
        return () => {
          captured = undefined
        }
      },
    },
  })
  return captured as StubAdapter
}

async function collect(
  adapter: StubAdapter,
  { systemText, userText }: { systemText?: string; userText: string },
): Promise<Record<string, unknown>[]> {
  const messages: Array<Record<string, unknown>> = []
  if (systemText !== undefined) messages.push({ role: 'system', content: systemText })
  messages.push({ role: 'user', content: [{ type: 'text', text: userText }] })
  const chunks: Record<string, unknown>[] = []
  for await (const chunk of adapter.stream({ messages })) {
    chunks.push(chunk)
  }
  return chunks
}

describe('E2E 模型桩适配器（play-e2e 票据 02）', () => {
  it('产出合法事件序列，且 finish 之后不再有任何事件', async () => {
    const adapter = register()
    const chunks = await collect(adapter, {
      systemText: CALLER_SIGNATURES.author + ' 后续六层……',
      userText: `${AUTHOR_MARKER} 玩家推门而入`,
    })
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'block-start',
      'text-delta',
      'block-end',
      'usage',
      'finish',
    ])
    expect(chunks[1]?.text).toBe(AUTHOR_GOLD)
    expect((chunks[3]?.usage as Record<string, unknown>).outputTokens).toBeGreaterThan(0)
    expect((chunks[4]?.reason as Record<string, unknown>).kind).toBe('stop')
  })

  it('一次调用只进入 stream 一次（证明没有触发宿主重试）', async () => {
    // Its own audit file: the stub appends, so sharing one across tests would count the earlier
    // call too.
    const auditFile = join(auditDir, 'single-call.jsonl')
    process.env.DSH_RRP_E2E_AUDIT = auditFile
    const adapter = register()
    await collect(adapter, { userText: '无标记输入' })
    const lines = readFileSync(auditFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { at: string })
    expect(lines.filter((line) => line.at === 'stream-enter')).toHaveLength(1)
    expect(lines.filter((line) => line.at === 'stream-finish')).toHaveLength(1)
  })

  it('resolveModel 报告桩身份与上下文窗口', async () => {
    const adapter = register()
    const resolved = await adapter.resolveModel(StubProvider, 'fixed')
    expect(resolved.provider).toBe(StubProvider)
    expect(resolved.id).toBe('fixed')
    expect((resolved.context as Record<string, unknown>).contextWindow).toBe(128_000)
  })
})
