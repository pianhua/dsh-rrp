#!/usr/bin/env node
/**
 * fetch-pjsk-assets.mjs — download the pjsk-saki card's image assets from the
 * original SillyTavern card's GitHub image host into ui/assets/, then stop:
 * the card sources reference only local relative paths, so this script is the
 * one place the external origin is allowed to appear. Idempotent: existing
 * files of matching size are skipped.
 *
 * Usage: node scripts/fetch-pjsk-assets.mjs
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(ROOT, 'cards', 'pjsk-saki', 'ui', 'assets')
const BASE = 'https://raw.githubusercontent.com/Cat-organ/my-image-pjsk/refs/heads/main/image/'

const MEMBERS = {
  ln: ['Ichika', 'Saki', 'Honami', 'Shiho'],
  mmj: ['Minori', 'Haruka', 'Airi', 'Shizuku'],
  vbs: ['Kohane', 'An', 'Akito', 'Toya'],
  ws: ['Tsukasa', 'Emu', 'Nene', 'Rui'],
  25: ['Kanade', 'Mafuyu', 'Ena', 'Mizuki'],
}
const LOGOS = ['LN', 'MMJ', 'VBS', 'WS', '25ji']
const BACKGROUNDS = [
  'pjsk-PC.jpg',
  'pjsk-PC-2.png',
  'pjsk-PC-5.png',
  'pjsk-PC-9.png',
  'pjsk-PC-14.png',
  'pjsk-PC-20.png',
  'pjsk-PC-26.png',
]

const files = []
for (const [unit, names] of Object.entries(MEMBERS))
  for (const name of names)
    files.push([`Profile/${unit}/${name}.webp`, `profile/${unit}/${name}.webp`])
for (const logo of LOGOS) files.push([`Logo/${logo}-Logo.png`, `logo/${logo}-Logo.png`])
for (const bg of BACKGROUNDS) files.push([`pc-bg/Default/${bg}`, `bg/${bg}`])

async function fetchOne(remote, local) {
  const target = join(ASSETS, local)
  if (existsSync(target)) return 'skip'
  mkdirSync(dirname(target), { recursive: true })
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(BASE + remote, { signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      writeFileSync(target, Buffer.from(await res.arrayBuffer()))
      return 'ok'
    } catch (error) {
      if (attempt === 3) return 'fail: ' + String(error)
    }
  }
  return 'fail'
}

let ok = 0
let skip = 0
const failed = []
for (const [remote, local] of files) {
  const result = await fetchOne(remote, local)
  if (result === 'ok') ok++
  else if (result === 'skip') skip++
  else failed.push(remote + '  (' + result + ')')
  process.stdout.write(result === 'ok' ? '.' : result === 'skip' ? 's' : 'x')
}
console.log('\n\nfetched: ' + ok + ', already present: ' + skip + ', failed: ' + failed.length)
for (const f of failed) console.log('  FAIL ' + f)
let bytes = 0
for (const [, local] of files) {
  const p = join(ASSETS, local)
  if (existsSync(p)) bytes += statSync(p).size
}
console.log('assets size: ' + (bytes / 1024 / 1024).toFixed(1) + ' MB')
process.exit(failed.length > 0 ? 1 : 0)
