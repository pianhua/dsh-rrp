import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOCALE_EN, LOCALE_ZH } from '../src/client/locales.ts'

const clientDir = fileURLToPath(new URL('../src/client', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) && !entry.endsWith('.d.ts') ? [full] : []
  })
}

const usedKeys = new Set<string>()
for (const file of sourceFiles(clientDir)) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/\bt\('([\w.]+)'\)/g)) {
    usedKeys.add(match[1])
  }
}

describe('locale key discipline (HOST_ALIGNMENT red line)', () => {
  it('ZH and EN dictionaries expose the same key set', () => {
    expect(Object.keys(LOCALE_EN).sort()).toEqual(Object.keys(LOCALE_ZH).sort())
  })

  it("every t('…') key used in client sources is registered in both dictionaries", () => {
    const missing = [...usedKeys].filter((key) => !(key in LOCALE_ZH) || !(key in LOCALE_EN))
    expect(missing).toEqual([])
  })
})
