import { describe, expect, it } from 'vitest'
import { worldlineDigestProjection } from '../src/projection/worldline-digest.ts'
import { emptyWorldlineDigest, type WorldlineDigest } from '../src/worldline-digest.ts'
import { rrpStateMessage } from '../src/state-payload.ts'
import { emptyWorldState, type WorldState } from '../src/world-state.ts'

const apply = worldlineDigestProjection.apply as (
  state: WorldlineDigest,
  event: unknown,
) => WorldlineDigest

function player(seq: number, text: string) {
  return {
    type: 'user/message',
    seq,
    data: {
      id: 'u' + String(seq),
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    },
  }
}
function assistant(seq: number, text: string) {
  return {
    type: 'assistant/message',
    seq,
    data: {
      turn: 0,
      step: 0,
      message: {
        id: 'a' + String(seq),
        role: 'assistant',
        content: [{ type: 'text', text }],
        source: { kind: 'model', provider: 'p', model: 'm' },
      },
    },
  }
}
function notice(seq: number, text: string) {
  return {
    type: 'user/message',
    seq,
    data: {
      id: 'n' + String(seq),
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: 'dsh-rrp', form: 'notice' },
    },
  }
}
function stateEvent(seq: number, worldState: Partial<WorldState>) {
  const merged = { ...emptyWorldState(), ...worldState } as WorldState
  return {
    type: 'user/message',
    seq,
    data: rrpStateMessage('st' + String(seq), 'ctx', { worldState: merged }),
  }
}

describe('worldline digest fold (issue #28)', () => {
  it('opens a save slot per real player message; the LAST assistant text wins the prose', () => {
    let state = apply(emptyWorldlineDigest(), player(1, '我推门而入'))
    state = apply(state, assistant(2, 'The player pushes the door open...'))
    state = apply(state, assistant(3, '门轴吱呀一声。'))
    state = apply(state, player(4, '我环顾四周'))
    expect(state.turns.map((entry) => [entry.turn, entry.seq, entry.player, entry.prose])).toEqual([
      [0, 1, '我推门而入', '门轴吱呀一声。'],
      [1, 4, '我环顾四周', ''],
    ])
  })

  it('skips plugin notices and empty messages entirely', () => {
    const state = apply(apply(emptyWorldlineDigest(), notice(1, '序章')), player(2, ''))
    expect(state.turns).toEqual([])
  })

  it('unrelated events keep the exact same state reference', () => {
    const base = apply(emptyWorldlineDigest(), player(1, 'x'))
    expect(apply(base, { type: 'turn/end', seq: 2, data: {} })).toBe(base)
  })

  it('a state publish writes the badge back onto the finished turn and forward onto the next', () => {
    let state = apply(emptyWorldlineDigest(), player(1, '住店'))
    state = apply(state, assistant(2, '温娘子让开门。'))
    state = apply(
      state,
      stateEvent(3, {
        trackedObjects: {
          inn: {
            id: 'inn',
            kind: 'scene',
            name: '客栈大堂',
            fields: {
              location: { type: 'string', value: '客栈大堂', definition: 'card-defined' },
              time: { type: 'string', value: '夜', definition: 'card-defined' },
            },
          },
          mia: {
            id: 'mia',
            kind: 'character',
            name: '米娅',
            character: { affinity: 8 },
            fields: {},
          },
          wenyan: {
            id: 'wenyan',
            kind: 'character',
            name: '温娘子',
            character: { affinity: 3 },
            fields: {},
          },
        },
      }),
    )
    expect(state.turns[0]?.badge).toEqual({
      location: '客栈大堂',
      time: '夜',
      affinity: [
        { name: '米娅', value: 8 },
        { name: '温娘子', value: 3 },
      ],
    })
    state = apply(state, player(4, '上楼'))
    expect(state.turns[1]?.badge).toEqual(state.turns[0]?.badge)
  })

  it('an opening state before any turn parks in the pending watermark', () => {
    const state = apply(
      emptyWorldlineDigest(),
      stateEvent(1, {
        trackedObjects: {
          doorway: {
            id: 'doorway',
            kind: 'scene',
            name: '门口',
            fields: {
              location: { type: 'string', value: '门口', definition: 'card-defined' },
            },
          },
        },
      }),
    )
    expect(state.turns).toEqual([])
    expect(state.pending?.location).toBe('门口')
  })

  it('the summary publish contributes the compass line', () => {
    let state = apply(emptyWorldlineDigest(), player(1, 'x'))
    state = apply(state, {
      type: 'user/message',
      seq: 2,
      data: rrpStateMessage('sm', 'ctx', {
        summary: { goal: 'g', conflict: '身份即将穿帮', turningPoints: [], threads: [] },
        summaryTurn: 0,
      }),
    })
    expect(state.turns[0]?.badge?.summary).toBe('身份即将穿帮')
  })

  it('long player lines are cut to the slot width', () => {
    const state = apply(emptyWorldlineDigest(), player(1, '长'.repeat(200)))
    expect(state.turns[0]?.player.length).toBe(120)
  })
})
