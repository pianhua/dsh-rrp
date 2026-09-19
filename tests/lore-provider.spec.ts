import { describe, expect, it } from 'vitest'
import { createSedimentProvider } from '../src/sediment-provider.ts'
import type { SedimentEntry } from '../src/sediment-state.ts'

describe('per-session sediment skill provider', () => {
  it('exposes exactly the owning session skills', async () => {
    const firstState: SedimentEntry[] = [
      { name: 'qingqiu-lore', description: '青丘狐族；涉及青丘时使用。', body: '# 青丘\n\n九尾为尊。' },
    ]
    const secondState: SedimentEntry[] = [
      { name: 'other-lore', description: '别的会话；不应串味。', body: '# 别的' },
    ]

    const first = createSedimentProvider({ sessionId: 's1', read: () => firstState })
    const candidates = await first.list({})
    expect(candidates.map((candidate) => candidate.name)).toEqual(['qingqiu-lore'])
    const loaded = await first.get(candidates[0]!, {})
    expect(loaded?.content).toContain('九尾为尊')
    expect(loaded?.resourceBase).toBeUndefined()
    expect(loaded?.path).toBeUndefined()

    const second = createSedimentProvider({ sessionId: 's2', read: () => secondState })
    expect((await second.list({})).map((candidate) => candidate.name)).toEqual(['other-lore'])
  })

  it('returns an empty catalog for a session with no sediment', async () => {
    expect(await createSedimentProvider({ sessionId: 'empty', read: () => [] }).list({})).toEqual([])
  })
})
