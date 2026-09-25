import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readCard } from '../src/cards.ts'
import {
  cardStateSchema,
  cardStateFieldOf,
  cardStateFieldStatus,
  parseCardStateSchema,
  readCardStateSchema,
  type CardStateSchema,
} from '../src/card-state-schema.ts'

const VALID: CardStateSchema = {
  version: 2,
  fields: [
    {
      id: 'affinity',
      label: '好感',
      appliesTo: ['character'],
      type: 'number',
      default: 0,
      min: 0,
      max: 100,
      order: 10,
      component: 'gauge',
      visibility: 'player',
    },
    {
      id: 'condition',
      label: '当前状态',
      appliesTo: ['character'],
      type: 'string',
      component: 'textarea',
      visibility: 'model',
    },
  ],
  migrations: [
    {
      fromVersion: 1,
      toVersion: 2,
      aliases: [{ from: 'bond', to: 'affinity' }],
    },
  ],
}

describe('card state schema', () => {
  let home: string
  let previousHome: string | undefined

  beforeEach(() => {
    previousHome = process.env.DSH_HOME
    home = mkdtempSync(join(tmpdir(), 'dsh-rrp-card-schema-home-'))
    process.env.DSH_HOME = home
  })

  afterEach(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  })

  it('validates applicable scalar fields and migration aliases', () => {
    const parsed = parseCardStateSchema(VALID)
    expect(parsed).toEqual(VALID)
    expect(cardStateSchema.safeParse(VALID).success).toBe(true)
    expect(cardStateFieldOf(VALID, 'bond', 'character')).toEqual(VALID.fields[0])
    expect(cardStateFieldOf(VALID, 'affinity', 'scene')).toBeUndefined()
    const oldSchema = {
      ...VALID,
      fields: [{ ...VALID.fields[0], id: 'bond' }],
      migrations: undefined,
    }
    expect(cardStateFieldStatus(VALID, 'bond', 'character', oldSchema)).toMatchObject({
      definition: 'card-defined',
      mismatch: false,
    })
    expect(
      cardStateFieldStatus({ ...VALID, migrations: undefined }, 'bond', 'character', oldSchema),
    ).toMatchObject({
      definition: 'undeclared',
      mismatch: true,
    })
  })

  it('rejects mismatched defaults, ranges, duplicate ids, and arbitrary components', () => {
    expect(
      parseCardStateSchema({
        ...VALID,
        fields: [
          {
            ...VALID.fields[0],
            default: 'not a number',
          },
        ],
      }),
    ).toBeUndefined()
    expect(
      parseCardStateSchema({
        ...VALID,
        fields: [
          {
            ...VALID.fields[0],
            min: 100,
            max: 0,
          },
        ],
      }),
    ).toBeUndefined()
    expect(
      parseCardStateSchema({
        ...VALID,
        fields: [VALID.fields[0], VALID.fields[0]],
      }),
    ).toBeUndefined()
    expect(
      parseCardStateSchema({
        ...VALID,
        fields: [{ ...VALID.fields[0], component: 'arbitrary-runtime' }],
      }),
    ).toBeUndefined()
  })

  it('reads a standalone state.schema.json without applying defaults to state.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-rrp-state-schema-'))
    const card = join(root, 'demo')
    try {
      mkdirSync(card, { recursive: true })
      writeFileSync(join(card, 'state.schema.json'), JSON.stringify(VALID))
      writeFileSync(
        join(card, 'state.json'),
        JSON.stringify({
          version: 2,
          trackedObjects: {},
          globalFields: {},
          objectives: [],
          conflicts: [],
          cognition: [],
          relations: [],
          currentEvents: [],
        }),
      )
      expect(readCardStateSchema(card)).toEqual(VALID)
      writeFileSync(join(card, 'state.schema.json'), '{ bad json')
      expect(readCardStateSchema(card)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps schema defaults out of a card initial state and permits missing schemas', () => {
    const pack = readCard('maid-heiress')
    expect(pack?.stateSchema?.fields.find((field) => field.id === 'affinity')?.default).toBe(0)
    expect(pack?.initialState?.trackedObjects.mia?.character?.affinity).toBe(6)

    const plain = readCard('yanmen-inn')
    expect(plain?.stateSchema).toBeDefined()
    expect(plain?.initialState?.trackedObjects.wenyan?.character?.affinity).toBeUndefined()

    const card = join(home, '.dsh-rrp', 'cards', 'plain')
    mkdirSync(card, { recursive: true })
    writeFileSync(join(card, 'card.md'), '---\nid: plain\nname: 普通卡\n---\n\n正文。')
    writeFileSync(
      join(card, 'state.json'),
      JSON.stringify({
        version: 2,
        trackedObjects: {},
        globalFields: {},
        objectives: [],
        conflicts: [],
        cognition: [],
        relations: [],
        currentEvents: [],
      }),
    )
    expect(readCard('plain')?.stateSchema).toBeNull()
    expect(readCard('plain')?.initialState).not.toBeNull()
  })
})
