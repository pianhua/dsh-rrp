import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSedimentProvider } from '../src/sediment-provider.ts'
import { writeSediment } from '../src/sediment.ts'

const homes: string[] = []
function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-rrp-sedprov-'))
  homes.push(home)
  return home
}
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

describe('per-session sediment skill provider', () => {
  it('exposes exactly the owning session skills', async () => {
    const home = tempHome()
    writeSediment(home, 's1', { name: 'qingqiu-lore', description: '青丘狐族；涉及青丘时使用。', body: '# 青丘\n\n九尾为尊。' })
    writeSediment(home, 's2', { name: 'other-lore', description: '别的会话；不应串味。', body: '# 别的' })

    const first = createSedimentProvider({ sessionId: 's1', home })
    const candidates = await first.list({})
    expect(candidates.map((candidate) => candidate.name)).toEqual(['qingqiu-lore'])
    const loaded = await first.get(candidates[0]!, {})
    expect(loaded?.content).toContain('九尾为尊')
    expect(loaded?.resourceBase?.path).toContain('s1')

    const second = createSedimentProvider({ sessionId: 's2', home })
    expect((await second.list({})).map((candidate) => candidate.name)).toEqual(['other-lore'])
  })

  it('returns an empty catalog for a session with no sediment', async () => {
    const home = tempHome()
    expect(await createSedimentProvider({ sessionId: 'empty', home }).list({})).toEqual([])
  })
})
