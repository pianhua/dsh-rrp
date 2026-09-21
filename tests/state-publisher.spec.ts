import { describe, expect, it } from 'vitest'
import { CARD_KEY, renderCardContext, type CardContext } from '../src/card-types.ts'
import { seedCardTriggersForTesting } from '../src/cards.ts'
import {
  parseWhen,
  renderTriggerBlock,
  type TriggerDef,
  type WhenCondition,
} from '../src/lore-condition.ts'
import { rrpStateMessage, type RrpStatePayload } from '../src/state-payload.ts'
import { publishState } from '../src/state-publisher.ts'
import { RRP_SETTINGS_KEY } from '../src/settings.ts'
import { emptyWorldState, renderWorldState, type WorldState } from '../src/world-state.ts'
import { transcriptProjections } from './stubs/transcript-projections.ts'

const CARD: CardContext = { id: 'c1', name: '测试卡', persona: 'P', worldCore: 'W' }
const STATE = { ...emptyWorldState(), scene: { location: '门口' } }

/** A fake session recording appends. */
function fakeSession(id: string) {
  const appended: Array<{ type: string; data: unknown; intent?: unknown }> = []
  const session = {
    id,
    append(type: string, data: unknown, intent?: unknown) {
      appended.push({ type, data, intent })
      return { seq: appended.length }
    },
  }
  return { session, appended }
}

/** Payload of an appended fake-session entry. */
const payloadOf = (data: unknown): RrpStatePayload | undefined =>
  (data as { source?: { rrp?: RrpStatePayload } })?.source?.rrp

/** Model-facing text of an appended entry. */
const textOf = (data: unknown): string =>
  (data as { content: Array<{ text: string }> }).content[0]?.text ?? ''

/** A log event carrying our structured payload (source.rrp) and its rendered text. */
const owned = (seq: number, text: string, payload: RrpStatePayload) => ({
  seq,
  type: 'user/message',
  data: rrpStateMessage('m' + seq, text, payload),
})

/** Parse a when source, asserting success. */
function mustCond(src: string): WhenCondition {
  const parsed = parseWhen(src, '测试')
  if (parsed instanceof Error) throw parsed
  return parsed
}

const TRIGGER_CARD: CardContext = { id: 'trig-card', name: '触发卡', persona: 'P', worldCore: 'W' }
const WARM: TriggerDef = {
  id: 'mia-warm',
  name: '温热',
  condition: mustCond('characters.米娅.affinity >= 40'),
  excerpt: '温热片段',
}
const INTIMATE: TriggerDef = {
  id: 'mia-intimate',
  name: '亲密',
  condition: mustCond('characters.米娅.affinity >= 80'),
  excerpt: '亲密片段',
}

const withAffinity = (value: number): WorldState => ({
  ...emptyWorldState(),
  characters: { 米娅: { affinity: value } },
})

const BLOCK_MARK = '【条件注入 · 裁决块】'

/** The trigger-block substring of a facts text (the block is always the tail). */
const blockOf = (text: string): string => text.slice(text.indexOf(BLOCK_MARK))

describe('durable state publisher', () => {
  it('publishes the card once and the facts once on the first pass', () => {
    const { session, appended } = fakeSession('sp-a1')
    publishState(session, { stateOf: () => undefined }, { card: CARD, worldState: STATE })
    expect(appended).toHaveLength(2)
    expect((appended[0]?.intent as { surfaceOp: string }).surfaceOp).toBe('append')
    expect((appended[1]?.intent as { surfaceOp: string }).surfaceOp).toBe('append')
  })

  it('carries the structured payload in source, not in the model-facing content', () => {
    const { session, appended } = fakeSession('sp-a2')
    publishState(session, { stateOf: () => undefined }, { card: CARD, worldState: STATE })
    expect(payloadOf(appended[0]?.data)?.card).toEqual(CARD)
    expect(payloadOf(appended[1]?.data)?.worldState).toEqual(STATE)
    // The content is the rendered baseline the model reads.
    const content = (appended[1]?.data as { content: Array<{ text: string }> }).content[0]?.text
    expect(content).toBe(renderWorldState(STATE))
  })

  it('appends only changed facts and never duplicates the constant card', () => {
    const { session, appended } = fakeSession('sp-a3')
    publishState(session, { stateOf: () => undefined }, { card: CARD, worldState: STATE })
    publishState(
      session,
      { stateOf: () => undefined },
      { card: CARD, worldState: { ...STATE, flags: { 新事实: true } } },
    )

    expect(appended).toHaveLength(3)
    const cardAppends = appended.filter((entry) => payloadOf(entry.data)?.card !== undefined)
    expect(cardAppends).toHaveLength(1)
    const factsAppends = appended.filter((entry) => payloadOf(entry.data)?.worldState !== undefined)
    expect(factsAppends).toHaveLength(2)
  })

  it('does not collapse two cards with identical rendered text', () => {
    const { session, appended } = fakeSession('sp-card-id')
    const samePresentation = { ...CARD, id: 'c2' }
    publishState(session, { stateOf: () => undefined }, { card: CARD })
    publishState(session, { stateOf: () => undefined }, { card: samePresentation })
    expect(appended).toHaveLength(2)
    expect(payloadOf(appended[1]?.data)?.card?.id).toBe('c2')
  })

  it('NEVER emits a replace (cache continuity guard)', () => {
    const { session, appended } = fakeSession('sp-a4')
    publishState(session, { stateOf: () => undefined }, { worldState: STATE })
    publishState(
      session,
      { stateOf: () => undefined },
      { worldState: { ...STATE, flags: { 又一条: true } } },
    )
    publishState(
      session,
      { stateOf: () => undefined },
      { worldState: { ...STATE, flags: { 再一条: true } } },
    )

    for (const entry of appended) {
      expect((entry.intent as { surfaceOp: unknown }).surfaceOp).toBe('append')
    }
  })

  it('publishes nothing when neither card nor state is present', () => {
    const { session, appended } = fakeSession('sp-a5')
    publishState(session, { stateOf: () => undefined }, {})
    expect(appended).toHaveLength(0)
  })

  it('adopts existing context after a restart instead of duplicating it', () => {
    const seed = [
      owned(1, renderCardContext(CARD), { card: CARD }),
      owned(2, renderWorldState(STATE), { worldState: STATE }),
    ]
    const { session, appended } = fakeSession('sp-a6')
    publishState(session, transcriptProjections(seed), { card: CARD, worldState: STATE })
    expect(appended).toHaveLength(0) // fully adopted: nothing re-published
  })

  it('appends only the changed facts after a restart (no card duplicate)', () => {
    const seed = [
      owned(1, renderCardContext(CARD), { card: CARD }),
      owned(2, renderWorldState(STATE), { worldState: STATE }),
    ]
    const { session, appended } = fakeSession('sp-a7')
    publishState(session, transcriptProjections(seed), {
      card: CARD,
      worldState: { ...STATE, flags: { 新事实: true } },
    })

    expect(appended).toHaveLength(1)
    expect(payloadOf(appended[0]?.data)?.worldState).toEqual({ ...STATE, flags: { 新事实: true } })
  })

  it('does not re-publish an unchanged facts block', () => {
    const { session, appended } = fakeSession('sp-a8')
    publishState(session, { stateOf: () => undefined }, { card: CARD, worldState: STATE })
    publishState(session, { stateOf: () => undefined }, { card: CARD, worldState: STATE })
    expect(appended).toHaveLength(2) // card + facts only
  })

  it('reads the unchanged lanes from the projections when a patch omits them', () => {
    const { session, appended } = fakeSession('sp-a9')
    publishState(
      session,
      { stateOf: (_s, key) => (key === CARD_KEY ? CARD : undefined) },
      { worldState: STATE },
    )
    // Card lane is not in the patch, so only the facts message is appended.
    expect(appended).toHaveLength(1)
    expect(payloadOf(appended[0]?.data)?.worldState).toEqual(STATE)
    expect(renderCardContext(CARD)).toContain('测试卡')
  })

  it('appends a settings-only change even when rendered facts stay unchanged', () => {
    const { session, appended } = fakeSession('sp-settings')
    const projections = {
      stateOf: (_session: unknown, key: string) => {
        if (key === 'rrpWorldState') return STATE
        if (key === RRP_SETTINGS_KEY) return { summaryEnabled: true }
        return undefined
      },
    }
    publishState(session, projections, { worldState: STATE })
    publishState(session, projections, {
      settings: { summaryEnabled: false, summaryEveryTurns: 8 },
    })

    expect(appended).toHaveLength(2)
    expect(payloadOf(appended[1]?.data)?.settings).toEqual({
      summaryEnabled: false,
      summaryEveryTurns: 8,
    })
    expect((appended[1]?.data as { content: Array<{ text: string }> }).content[0]?.text).toBe(
      renderWorldState(STATE),
    )
  })

  it('always appends a lore operation without exposing its body in content', () => {
    const { session, appended } = fakeSession('sp-lore')
    const projections = {
      stateOf: (_session: unknown, key: string) => (key === 'rrpWorldState' ? STATE : undefined),
    }
    publishState(session, projections, { worldState: STATE })
    publishState(session, projections, {
      sediment: {
        kind: 'add',
        skill: { name: 'hidden-lore', description: 'secret', body: 'BODY MUST STAY HIDDEN' },
      },
    })

    expect(appended).toHaveLength(2)
    expect(payloadOf(appended[1]?.data)?.sediment?.kind).toBe('add')
    // Metadata-only publish: model-visible content is the one-line breadcrumb,
    // not a full state re-render; the lore body stays in the hidden payload.
    const text = (appended[1]?.data as { content: Array<{ text: string }> }).content[0]?.text
    expect(text).not.toBe(renderWorldState(STATE))
    expect(text).toContain('dsh-rrp')
    expect(text).not.toContain('BODY MUST STAY HIDDEN')
    // Hidden payload still carries the whole world state (fork/replay rule).
    expect(payloadOf(appended[1]?.data)?.worldState).toEqual(STATE)
  })

  it('republishes when only the summary cadence changes (issue #9)', () => {
    const { session, appended } = fakeSession('sp-cadence')
    const projections = { stateOf: () => undefined }
    publishState(session, projections, { settings: { summaryEnabled: true, summaryEveryTurns: 8 } })
    publishState(session, projections, { settings: { summaryEnabled: true, summaryEveryTurns: 4 } })
    expect(appended).toHaveLength(2)
    expect(payloadOf(appended[1]?.data)?.settings?.summaryEveryTurns).toBe(4)
  })

  it('persists a summary even when the session has no WorldState yet', () => {
    const { session, appended } = fakeSession('sp-summary-only')
    const summary = { goal: '目标', conflict: '矛盾', turningPoints: [], threads: [] }
    publishState(session, { stateOf: () => undefined }, { summary })
    expect(appended).toHaveLength(1)
    expect(payloadOf(appended[0]?.data)?.summary).toEqual(summary)
    expect(payloadOf(appended[0]?.data)?.worldState).toBeUndefined()
  })

  it('persists an explicit summary clear', () => {
    const { session, appended } = fakeSession('sp-summary-clear')
    publishState(session, { stateOf: () => undefined }, { summary: null })
    expect(appended).toHaveLength(1)
    expect(payloadOf(appended[0]?.data)?.summary).toBeNull()
  })
})

describe('conditional injection in the facts lane (issue #16)', () => {
  it('injects nothing while no trigger band is crossed', () => {
    seedCardTriggersForTesting(TRIGGER_CARD.id, [WARM, INTIMATE])
    const { session, appended } = fakeSession('sp-trig-below')
    publishState(
      session,
      { stateOf: () => undefined },
      { card: TRIGGER_CARD, worldState: withAffinity(6) },
    )
    expect(appended).toHaveLength(2)
    expect(textOf(appended[1]?.data)).not.toContain(BLOCK_MARK)
  })

  it('publishes the block once when the band is crossed (40), then stays byte-identical within the band', () => {
    seedCardTriggersForTesting(TRIGGER_CARD.id, [WARM, INTIMATE])
    const { session, appended } = fakeSession('sp-trig-band')
    publishState(
      session,
      { stateOf: () => undefined },
      { card: TRIGGER_CARD, worldState: withAffinity(39) },
    )
    publishState(
      session,
      { stateOf: () => undefined },
      { card: TRIGGER_CARD, worldState: withAffinity(40) },
    )
    publishState(
      session,
      { stateOf: () => undefined },
      { card: TRIGGER_CARD, worldState: withAffinity(79) },
    )
    expect(appended).toHaveLength(4) // card + facts(39) + facts(40) + facts(79)

    const at40 = textOf(appended[2]?.data)
    const at79 = textOf(appended[3]?.data)
    expect(at40).toContain(BLOCK_MARK)
    expect(at40).toContain('温热片段')
    expect(at40).not.toContain('亲密片段')
    // Within-band wobble: the state re-render differs, but the injected block
    // is keyed only by the hit set and must be byte-identical.
    expect(blockOf(at79)).toBe(blockOf(at40))
  })

  it('crossing into the 80 band publishes a new block listing both hits, with no revocation', () => {
    seedCardTriggersForTesting(TRIGGER_CARD.id, [WARM, INTIMATE])
    const { session, appended } = fakeSession('sp-trig-80')
    publishState(
      session,
      { stateOf: () => undefined },
      { card: TRIGGER_CARD, worldState: withAffinity(40) },
    )
    publishState(
      session,
      { stateOf: () => undefined },
      { card: TRIGGER_CARD, worldState: withAffinity(81) },
    )
    const block = blockOf(textOf(appended[2]?.data))
    expect(block).toContain('亲密片段')
    expect(block).toContain('温热片段')
    // Growth, not shrink: no revocation sentence.
    expect(block).not.toContain('现已失效')
  })

  it('dropping below the band publishes a block with the revocation sentence', () => {
    seedCardTriggersForTesting(TRIGGER_CARD.id, [WARM, INTIMATE])
    const { session, appended } = fakeSession('sp-trig-revoke')
    publishState(
      session,
      { stateOf: () => undefined },
      { card: TRIGGER_CARD, worldState: withAffinity(81) },
    )
    publishState(
      session,
      { stateOf: () => undefined },
      { card: TRIGGER_CARD, worldState: withAffinity(20) },
    )
    const block = blockOf(textOf(appended[2]?.data))
    expect(block).toContain('（无）')
    expect(block).toContain('以下条目现已失效，立即停止使用其内容——亲密、温热')
  })

  it('re-publishing the same state never duplicates the block', () => {
    seedCardTriggersForTesting(TRIGGER_CARD.id, [WARM, INTIMATE])
    const { session, appended } = fakeSession('sp-trig-dedup')
    publishState(
      session,
      { stateOf: () => undefined },
      { card: TRIGGER_CARD, worldState: withAffinity(40) },
    )
    publishState(
      session,
      { stateOf: () => undefined },
      { card: TRIGGER_CARD, worldState: withAffinity(40) },
    )
    expect(appended).toHaveLength(2)
  })

  it('hit entries are listed in skill-id lexicographic order', () => {
    seedCardTriggersForTesting(TRIGGER_CARD.id, [INTIMATE, WARM])
    const { session, appended } = fakeSession('sp-trig-order')
    publishState(
      session,
      { stateOf: () => undefined },
      { card: TRIGGER_CARD, worldState: withAffinity(90) },
    )
    const block = blockOf(textOf(appended[1]?.data))
    expect(block.indexOf('1. 亲密')).not.toBe(-1)
    expect(block.indexOf('1. 亲密')).toBeLessThan(block.indexOf('2. 温热'))
  })

  it('the published block matches renderTriggerBlock byte for byte', () => {
    seedCardTriggersForTesting(TRIGGER_CARD.id, [WARM, INTIMATE])
    const { session, appended } = fakeSession('sp-trig-exact')
    publishState(
      session,
      { stateOf: () => undefined },
      { card: TRIGGER_CARD, worldState: withAffinity(81) },
    )
    const expected = renderTriggerBlock(
      [
        { id: 'mia-intimate', name: '亲密', excerpt: '亲密片段' },
        { id: 'mia-warm', name: '温热', excerpt: '温热片段' },
      ],
      [],
    )
    expect(blockOf(textOf(appended[1]?.data))).toBe(expected)
  })
})
