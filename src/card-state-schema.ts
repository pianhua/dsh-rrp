import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { TrackedObjectKind, WorldStateVisibility } from './world-state.ts'

const scalarTypes = ['number', 'string', 'boolean'] as const
const components = ['text', 'textarea', 'number', 'gauge', 'toggle'] as const
const objectKinds = ['global', 'character', 'group', 'item', 'scene'] as const
const visibilities = ['player', 'model', 'hidden'] as const

const scalarTypeSchema = z.enum(scalarTypes)
const fieldSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
    label: z.string().min(1),
    appliesTo: z.array(z.enum(objectKinds)).min(1),
    type: scalarTypeSchema,
    default: z.union([z.number(), z.string(), z.boolean()]).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    order: z.number().int().optional(),
    component: z.enum(components),
    visibility: z.enum(visibilities),
  })
  .strict()
  .superRefine((field, context) => {
    if (
      field.type === 'number' &&
      field.default !== undefined &&
      typeof field.default !== 'number'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['default'],
        message: 'number default must be a number',
      })
    }
    if (
      field.type === 'string' &&
      field.default !== undefined &&
      typeof field.default !== 'string'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['default'],
        message: 'string default must be a string',
      })
    }
    if (
      field.type === 'boolean' &&
      field.default !== undefined &&
      typeof field.default !== 'boolean'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['default'],
        message: 'boolean default must be a boolean',
      })
    }
    if (field.type !== 'number' && (field.min !== undefined || field.max !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['min'],
        message: 'min/max are only valid for number fields',
      })
    }
    const compatibleComponents = {
      number: new Set(['number', 'gauge']),
      string: new Set(['text', 'textarea']),
      boolean: new Set(['toggle']),
    } as const
    if (!compatibleComponents[field.type].has(field.component)) {
      context.addIssue({
        code: 'custom',
        path: ['component'],
        message: 'component does not match field type',
      })
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      context.addIssue({ code: 'custom', path: ['min'], message: 'min must not exceed max' })
    }
    if (field.type === 'number' && typeof field.default === 'number') {
      if (field.min !== undefined && field.default < field.min)
        context.addIssue({
          code: 'custom',
          path: ['default'],
          message: 'default must be at least min',
        })
      if (field.max !== undefined && field.default > field.max)
        context.addIssue({
          code: 'custom',
          path: ['default'],
          message: 'default must be at most max',
        })
    }
  })

const aliasSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
  })
  .strict()

const migrationSchema = z
  .object({
    fromVersion: z.number().int().nonnegative(),
    toVersion: z.number().int().positive(),
    aliases: z.array(aliasSchema).optional(),
  })
  .strict()
  .refine((migration) => migration.fromVersion < migration.toVersion, {
    message: 'migration must move to a later schema version',
    path: ['toVersion'],
  })

export const cardStateSchema = z
  .object({
    version: z.number().int().positive(),
    fields: z.array(fieldSchema),
    migrations: z.array(migrationSchema).optional(),
  })
  .strict()
  .superRefine((schema, context) => {
    const ids = new Set<string>()
    schema.fields.forEach((field, index) => {
      if (ids.has(field.id)) {
        context.addIssue({
          code: 'custom',
          path: ['fields', index, 'id'],
          message: 'duplicate field id',
        })
      }
      ids.add(field.id)
    })
    for (const migration of schema.migrations ?? []) {
      if (migration.toVersion > schema.version) {
        context.addIssue({
          code: 'custom',
          path: ['migrations'],
          message: 'migration target cannot exceed schema version',
        })
      }
      const aliases = new Set<string>()
      for (const alias of migration.aliases ?? []) {
        if (alias.from === alias.to) {
          context.addIssue({
            code: 'custom',
            path: ['migrations'],
            message: 'alias must rename a field',
          })
        }
        if (aliases.has(alias.from)) {
          context.addIssue({
            code: 'custom',
            path: ['migrations'],
            message: 'one old field cannot have multiple aliases',
          })
        }
        aliases.add(alias.from)
        if (!ids.has(alias.to)) {
          context.addIssue({
            code: 'custom',
            path: ['migrations'],
            message: 'alias target must be a declared field',
          })
        }
      }
    }
  })

export type CardStateSchema = {
  version: number
  fields: CardStateField[]
  migrations?: CardStateMigration[]
}

export type CardStateField = {
  id: string
  label: string
  appliesTo: Array<TrackedObjectKind | 'global'>
  type: (typeof scalarTypes)[number]
  default?: number | string | boolean
  min?: number
  max?: number
  order?: number
  component: (typeof components)[number]
  visibility: WorldStateVisibility
}

export type CardStateAlias = { from: string; to: string }

export type CardStateMigration = {
  fromVersion: number
  toVersion: number
  aliases?: CardStateAlias[]
}

export function parseCardStateSchema(value: unknown): CardStateSchema | undefined {
  const parsed = cardStateSchema.safeParse(value)
  return parsed.success ? (parsed.data as CardStateSchema) : undefined
}

export function readCardStateSchema(dir: string): CardStateSchema | null {
  const file = join(dir, 'state.schema.json')
  if (!existsSync(file)) return null
  try {
    return parseCardStateSchema(JSON.parse(readFileSync(file, 'utf8'))) ?? null
  } catch {
    return null
  }
}

export function cardStateFieldOf(
  schema: CardStateSchema,
  id: string,
  objectKind: CardStateField['appliesTo'][number],
): CardStateField | undefined {
  const fieldById = new Map(schema.fields.map((field) => [field.id, field]))
  const direct = fieldById.get(id)
  if (direct !== undefined && direct.appliesTo.includes(objectKind)) return direct
  for (const migration of schema.migrations ?? []) {
    const alias = migration.aliases?.find((candidate) => candidate.from === id)
    const target = alias === undefined ? undefined : fieldById.get(alias.to)
    if (target !== undefined && target.appliesTo.includes(objectKind)) return target
  }
  return undefined
}

export interface CardStateFieldStatus {
  id: string
  definition: 'card-defined' | 'undeclared'
  mismatch: boolean
  field?: CardStateField
}

export function cardStateFieldStatus(
  schema: CardStateSchema,
  id: string,
  objectKind: CardStateField['appliesTo'][number],
  previousSchema?: CardStateSchema,
): CardStateFieldStatus {
  const field = cardStateFieldOf(schema, id, objectKind)
  if (field !== undefined) return { id, definition: 'card-defined', mismatch: false, field }
  const existed =
    previousSchema !== undefined && cardStateFieldOf(previousSchema, id, objectKind) !== undefined
  return { id, definition: 'undeclared', mismatch: existed }
}
