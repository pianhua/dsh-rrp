import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { repoDirOf } from '../../src/repo-dir.ts'

let fixture: string | undefined

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'rrp-repo-dir-'))
  mkdirSync(join(root, 'presets', 'rp'), { recursive: true })
  writeFileSync(join(root, 'presets', 'rp', 'agent.cordis.yml'), 'preset: rp')
  fixture = root
  return root
}

afterEach(() => {
  if (fixture !== undefined) {
    rmSync(fixture, { recursive: true, force: true })
    fixture = undefined
  }
})

describe('repoDirOf（bundle 与源码双形态仓库相对目录解析）', () => {
  it('bundle 形态：模块在 lib/ 下一级即仓库根（浅层命中）', () => {
    const root = makeFixture()
    const bundleModule = join(root, 'lib', 'index.js')
    expect(repoDirOf(`file:///${bundleModule.replaceAll('\\', '/')}`, 'presets/rp')).toBe(
      join(root, 'presets', 'rp'),
    )
  })

  it('源码形态：模块在 src/<dir>/ 下深一级（深层命中）', () => {
    const root = makeFixture()
    const sourceModule = join(root, 'src', 'host', 'preset.ts')
    expect(repoDirOf(`file:///${sourceModule.replaceAll('\\', '/')}`, 'presets/rp')).toBe(
      join(root, 'presets', 'rp'),
    )
  })

  it('两层都不存在时回退浅层路径（保留 bundle 形态的原生报错形状）', () => {
    const root = makeFixture()
    const bundleModule = join(root, 'lib', 'index.js')
    expect(repoDirOf(`file:///${bundleModule.replaceAll('\\', '/')}`, 'no/such/dir')).toBe(
      join(root, 'no', 'such', 'dir'),
    )
  })

  it('源码形态自名陷阱：src/cards/cards.ts 解析 cards 必须落到仓库根而非 src/cards 自身（真实回归）', () => {
    const root = makeFixture()
    // 复刻 cards.ts 的真实场景：模块自己就住在 src/cards/ 里，
    // 浅层候选 == 模块所在目录自身（存在！），真根是深层候选。
    mkdirSync(join(root, 'cards', 'demo-card'), { recursive: true })
    writeFileSync(join(root, 'cards', 'demo-card', 'card.md'), '---\n---\n')
    mkdirSync(join(root, 'src', 'cards'), { recursive: true })
    const sourceModule = join(root, 'src', 'cards', 'cards.ts')
    expect(repoDirOf(`file:///${sourceModule.replaceAll('\\', '/')}`, 'cards')).toBe(
      join(root, 'cards'),
    )
  })

  it('bundle 形态不受 src/ 诱饵影响：lib/ 下浅层即真根', () => {
    const root = makeFixture()
    mkdirSync(join(root, 'src', 'presets', 'rp'), { recursive: true })
    writeFileSync(join(root, 'src', 'presets', 'rp', 'agent.cordis.yml'), 'decoy')
    const bundleModule = join(root, 'lib', 'index.js')
    expect(repoDirOf(`file:///${bundleModule.replaceAll('\\', '/')}`, 'presets/rp')).toBe(
      join(root, 'presets', 'rp'),
    )
  })
})
