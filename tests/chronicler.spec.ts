import { describe, expect, it } from 'vitest'
import { buildChroniclerPrompt, parseChroniclerReply } from '../src/agents/chronicler.ts'
import { forgetActivity, readActivity } from '../src/activity.ts'
import { forgetInference, registerChronicler } from '../src/chronicler.ts'
import { forgetState } from '../src/state-publisher.ts'
import { emptyWorldState, type WorldState } from '../src/world-state.ts'
import { transcriptProjections } from './stubs/transcript-projections.ts'

const PRIOR: WorldState = {
  ...emptyWorldState(),
  trackedObjects: {
    player: { id: 'player', kind: 'character', name: '玩家', isPlayer: true, fields: {} },
    mia: {
      id: 'mia',
      kind: 'character',
      name: '米娅',
      character: { presence: 'present', emotionalState: '警惕' },
      fields: {},
    },
  },
  objectives: [
    {
      id: 'find-key',
      owners: [{ objectId: 'player' }],
      desiredOutcome: '找到铜钥匙',
      status: 'active',
    },
  ],
}

const NEXT: WorldState = {
  ...PRIOR,
  trackedObjects: {
    ...PRIOR.trackedObjects,
    mia: {
      ...PRIOR.trackedObjects.mia!,
      character: { presence: 'present', emotionalState: '放松' },
    },
  },
  currentEvents: [
    {
      id: 'door-opened',
      type: 'discovery',
      fact: '密道入口已经被发现',
      relatedObjects: [{ objectId: 'mia' }],
      status: 'active',
      visibility: 'player',
    },
  ],
}

function rawReply(state: WorldState, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ state, ...extra })
}

describe('Chronicler v2 reply contract', () => {
  it('parses a complete v2 snapshot with a player-facing summary and evidence', () => {
    const parsed = parseChroniclerReply(
      rawReply(NEXT, {
        changeSummary: '米娅从警惕转为放松，并确认密道入口已被发现。',
        evidence: ['正文写明米娅放下了手里的刀。', '正文写明玩家看见密道入口。'],
      }),
    )

    expect(parsed?.state).toEqual(NEXT)
    expect(parsed?.changeSummary).toContain('米娅')
    expect(parsed?.evidence).toEqual(['正文写明米娅放下了手里的刀。', '正文写明玩家看见密道入口。'])
  })

  it('rejects the removed v1 shape and malformed v2 snapshots', () => {
    expect(
      parseChroniclerReply(JSON.stringify({ characters: {}, inventory: {}, scene: {}, flags: {} })),
    ).toBeUndefined()
    expect(parseChroniclerReply(JSON.stringify({ state: { ...NEXT, version: 1 } }))).toBeUndefined()
  })

  it('keeps prompt-cache-stable instructions and names evidence boundaries', () => {
    const prompt = buildChroniclerPrompt({ prior: PRIOR, transcript: '【玩家】\n我看见密道入口。' })
    expect(prompt).toContain('【此前的完整 WorldState v2】')
    expect(prompt).toContain('【本轮明确剧情证据】')
    expect(prompt).toContain('不要记录玩家行动、对白或内心')
    expect(prompt).toContain('外部引用')
    expect(prompt).toContain('没有明确解决证据就不要关闭')
    expect(prompt).toContain('我看见密道入口。')
  })

  it('normalizes a single-string evidence item to the v2 array shape', () => {
    const parsed = parseChroniclerReply(
      rawReply(NEXT, { changeSummary: '发现密道。', evidence: '正文明确写出密道入口。' }),
    )
    expect(parsed?.evidence).toEqual(['正文明确写出密道入口。'])
  })

  it('coerces an invented field definition to undeclared instead of failing the snapshot', () => {
    const drifted = structuredClone(NEXT)
    ;(drifted.trackedObjects.mia as { fields: Record<string, unknown> }).fields.trust = {
      type: 'number',
      value: 40,
      definition: 'model-inferred',
    }
    drifted.globalFields = {
      ...drifted.globalFields,
      mood: { type: 'string', value: '缓和', definition: 'inferred' },
    } as unknown as WorldState['globalFields']
    const parsed = parseChroniclerReply(
      rawReply(drifted as WorldState, { changeSummary: '信任变化。', evidence: [] }),
    )
    expect(parsed).toBeDefined()
    expect(
      (parsed!.state.trackedObjects.mia as { fields: Record<string, { definition: string }> })
        .fields.trust?.definition,
    ).toBe('undeclared')
    expect(parsed!.state.globalFields.mood?.definition).toBe('undeclared')
  })

  it('repairs bare-name references to objectId or external references', () => {
    const drifted = structuredClone(NEXT) as WorldState & {
      conflicts: Array<Record<string, unknown>>
    }
    drifted.conflicts = [
      {
        id: 'identity-gap',
        parties: ['mia', '客栈老板娘'],
        stakes: '身份悬殊',
        pressure: '雇佣关系束缚',
        status: 'active',
      },
    ]
    const parsed = parseChroniclerReply(
      rawReply(drifted, { changeSummary: '矛盾出现。', evidence: [] }),
    )
    expect(parsed).toBeDefined()
    expect(parsed!.state.conflicts[0]?.parties).toEqual([
      { objectId: 'mia' },
      { external: { name: '客栈老板娘' } },
    ])
  })

  it('clamps non-finite numbers the host event log would reject', () => {
    // JSON.parse("1e999") yields Infinity on the wire; build the reply text
    // manually because JSON.stringify would turn Infinity into null.
    const body = JSON.stringify({
      state: {
        ...NEXT,
        trackedObjects: { ...NEXT.trackedObjects },
        objectives: [],
        currentEvents: [],
      },
      changeSummary: '数值漂移。',
      evidence: [],
    })
    const reply = body.replace(
      '"character":{"presence":"present","emotionalState":"放松"},"fields":{}',
      '"character":{"presence":"present","emotionalState":"放松","affinity":1e999},"fields":{"trust":{"type":"number","value":1e999,"definition":"undeclared","min":-1e999}}',
    )
    const parsed = parseChroniclerReply(reply)
    expect(parsed).toBeDefined()
    const mia = parsed!.state.trackedObjects.mia as {
      character?: { affinity?: number }
      fields: Record<string, { value: number; min?: number }>
    }
    expect(mia.character?.affinity).toBe(0)
    expect(mia.fields.trust?.value).toBe(0)
    expect(mia.fields.trust?.min).toBeUndefined()
  })
})

function fakeHost(
  state: WorldState | undefined,
  reply: string,
  options: { failAppend?: boolean; turn?: number; llm?: unknown } = {},
) {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const appended: Array<{ type: string; data: unknown }> = []
  let started:
    | {
        kind: string
        run(): { cancel(reason?: string): void; done: Promise<{ status: string }> }
      }
    | undefined

  const events: Array<{ type: string; data: unknown }> = [
    { type: 'user/message', data: { content: [{ type: 'text', text: '我看见密道入口。' }] } },
    { type: 'assistant/message', data: { content: [{ type: 'text', text: '米娅放下了刀。' }] } },
  ]
  const session = {
    id: 'chronicler-v2-session',
    append(type: string, data: unknown) {
      if (options.failAppend === true) throw new Error('append failed')
      appended.push({ type, data })
      events.push({ type, data })
      return { type, data }
    },
  }
  const llm = options.llm ?? {
    async *stream() {
      yield { type: 'text-delta', text: reply }
    },
  }
  const jobs = {
    attachController: () => () => {},
    start(spec: typeof started) {
      started = spec
      return 'chronicler-v2-job'
    },
  }
  const agents = { get: () => ({ options: { provider: 'deepseek', model: 'deepseek-chat' } }) }
  const projections = transcriptProjections(events, (_session: unknown, key: string) => {
    if (key === 'agentPreset') return 'rp'
    if (key === 'rrpWorldState') return state
    if (key === 'turnBoundary') return { lastTurn: options.turn ?? 4 }
    return undefined
  })
  const ctx = {
    effect(fn: () => (() => void) | void) {
      return fn()
    },
    get(name: string): unknown {
      return ({ llm, jobs, agents, sessionProjections: projections } as Record<string, unknown>)[
        name
      ]
    },
    on(name: string, listener: (...args: unknown[]) => void) {
      listeners.set(name, listener)
      return () => {}
    },
  }
  return { ctx, session, listeners, appended, started: () => started }
}

const payloadOf = (data: unknown) =>
  (data as { source?: { rrp?: Record<string, unknown> } })?.source?.rrp

describe('Chronicler v2 runner', () => {
  it('publishes actor, fold cursor, timeline changes and player-facing evidence', async () => {
    forgetState('chronicler-v2-session')
    forgetActivity('chronicler-v2-session')
    forgetInference('chronicler-v2-session')
    const host = fakeHost(
      PRIOR,
      rawReply(NEXT, { changeSummary: '米娅放松了。', evidence: ['放下刀'] }),
    )
    registerChronicler(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, {
      type: 'turn/end',
      data: { reason: { kind: 'completed' } },
    })

    const outcome = await host.started()!.run().done
    expect(outcome.status).toBe('completed')
    const stateMessage = host.appended.find((entry) => entry.type === 'user/message')
    const payload = payloadOf(stateMessage?.data)
    expect(payload?.worldState).toEqual(NEXT)
    expect(payload?.stateFoldSeq).toBe(1)
    expect(payload?.worldStateTimelineBatch).toEqual(
      expect.objectContaining({
        kind: 'changes',
        changes: expect.arrayContaining([
          expect.objectContaining({
            field: 'trackedObjects.character.emotionalState',
            type: 'modified',
          }),
        ]),
        provenance: expect.objectContaining({
          actor: 'chronicler',
          storyTurn: 4,
          evidence: '米娅放松了。；证据：放下刀',
        }),
        origin: 'local',
      }),
    )
    expect(readActivity('chronicler-v2-session').entries.at(-1)?.phase).toBe('committed')
  })

  it('requests one repair pass when the first reply fails validation, then commits', async () => {
    forgetState('chronicler-v2-session')
    forgetActivity('chronicler-v2-session')
    forgetInference('chronicler-v2-session')
    let calls = 0
    const llm = {
      async *stream(options: Record<string, unknown>) {
        calls += 1
        const messages = options.messages as Array<{
          role: string
          content: Array<{ text: string }>
        }>
        if (calls === 1) {
          yield {
            type: 'text-delta',
            text: JSON.stringify({
              state: NEXT,
              changeSummary: '缺字段',
            }),
          }
          return
        }
        // The repair turn must see the malformed assistant reply plus an issue-list user message.
        expect(messages).toHaveLength(3)
        expect(messages[1]?.role).toBe('assistant')
        expect(messages[2]?.role).toBe('user')
        expect(messages[2]?.content[0]?.text).toContain('未通过 WorldState v2 校验')
        yield {
          type: 'text-delta',
          text: rawReply(NEXT, { changeSummary: '米娅放松了。', evidence: ['放下刀'] }),
        }
      },
    }
    const host = fakeHost(PRIOR, '', { llm })
    registerChronicler(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, {
      type: 'turn/end',
      data: { reason: { kind: 'completed' } },
    })

    const outcome = await host.started()!.run().done
    expect(outcome.status).toBe('completed')
    expect(calls).toBe(2)
    expect(host.appended.some((entry) => entry.type === 'user/message')).toBe(true)
    expect(readActivity('chronicler-v2-session').entries.at(-1)?.phase).toBe('committed')
  })

  it('does not append a timeline batch when the inferred state is unchanged', async () => {
    forgetState('chronicler-v2-session')
    forgetActivity('chronicler-v2-session')
    const host = fakeHost(PRIOR, rawReply(PRIOR, { changeSummary: '没有变化。', evidence: [] }))
    registerChronicler(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, {
      type: 'turn/end',
      data: { reason: { kind: 'completed' } },
    })
    expect((await host.started()!.run().done).status).toBe('completed')
    expect(host.appended.filter((entry) => entry.type === 'user/message')).toHaveLength(0)
  })

  it('does not append a timeline batch when the state append fails', async () => {
    forgetState('chronicler-v2-session')
    forgetActivity('chronicler-v2-session')
    const host = fakeHost(
      PRIOR,
      rawReply(NEXT, { changeSummary: '状态发生变化。', evidence: ['正文证据。'] }),
      { failAppend: true },
    )
    registerChronicler(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, {
      type: 'turn/end',
      data: { reason: { kind: 'completed' } },
    })
    expect((await host.started()!.run().done).status).toBe('failed')
    expect(host.appended.filter((entry) => entry.type === 'user/message')).toHaveLength(0)
    expect(payloadOf(host.appended[0]?.data)?.worldStateTimelineBatch).toBeUndefined()
  })

  it('does not append a timeline batch when inference is cancelled', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const host = fakeHost(PRIOR, rawReply(NEXT), {
      llm: {
        async *stream() {
          await gate
          yield { type: 'text-delta', text: rawReply(NEXT) }
        },
      },
    })
    registerChronicler(host.ctx as never, 'rp')
    host.listeners.get('session/event')?.(host.session, {
      type: 'turn/end',
      data: { reason: { kind: 'completed' } },
    })
    const hooks = host.started()!.run()
    hooks.cancel()
    release()
    expect((await hooks.done).status).toBe('killed')
    expect(host.appended.filter((entry) => entry.type === 'user/message')).toHaveLength(0)
  })
})
