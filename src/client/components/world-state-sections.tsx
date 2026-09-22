/**
 * dsh-rrp — core WorldState editing sections (Scene, Characters, Relations, Inventory, Flags).
 */
import { Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { WorldStateRelation } from '../../world-state.ts'
import { Field, RemoveButton, S, SectionHead, type Translate } from './world-state-primitives.tsx'

export interface CharacterRow {
  name: string
  affinity: string
  mood: string
  appearance: string
  condition: string
}

export interface InventoryRow {
  name: string
  quantity: string
  note: string
}

export interface FlagRow {
  key: string
  value: string
}

export interface SceneDraft {
  location: string
  time: string
  weather: string
}

/** Scene (environment, time, weather) section. */
export function SceneSection(props: {
  t: Translate
  scene: SceneDraft
  disabled: boolean
  onChange: (field: keyof SceneDraft, value: string) => void
}): ReactNode {
  const { t, scene, disabled, onChange } = props
  return (
    <div style={S.card}>
      <Field
        disabled={disabled}
        label={t('scene.location')}
        value={scene.location}
        onChange={(v) => onChange('location', v)}
      />
      <div style={S.grid2}>
        <div style={S.half}>
          <Field
            disabled={disabled}
            label={t('scene.time')}
            value={scene.time}
            onChange={(v) => onChange('time', v)}
          />
        </div>
        <div style={S.half}>
          <Field
            disabled={disabled}
            label={t('scene.weather')}
            value={scene.weather}
            onChange={(v) => onChange('weather', v)}
          />
        </div>
      </div>
    </div>
  )
}

/** Characters section with dynamic cards. */
export function CharactersSection(props: {
  t: Translate
  characters: CharacterRow[]
  rowKeys: readonly string[]
  disabled: boolean
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, field: keyof CharacterRow, value: string) => void
}): ReactNode {
  const { t, characters, rowKeys, disabled, onAdd, onRemove, onUpdate } = props
  return (
    <>
      <SectionHead
        title={t('section.characters')}
        count={characters.length}
        addLabel={t('add')}
        disabled={disabled}
        onAdd={onAdd}
      />
      {characters.map((row, index) => (
        <div key={rowKeys[index] ?? 'char-' + String(index)} style={S.card}>
          <div style={S.cardHead}>
            <span style={S.cardLabel}>{t('section.characters') + ' ' + String(index + 1)}</span>
            <RemoveButton disabled={disabled} label={t('remove')} onClick={() => onRemove(index)} />
          </div>
          <Field
            disabled={disabled}
            label={t('name')}
            value={row.name}
            onChange={(v) => onUpdate(index, 'name', v)}
          />
          <div style={S.grid2}>
            <div style={S.half}>
              <Field
                disabled={disabled}
                label={t('field.affinity')}
                value={row.affinity}
                onChange={(v) => onUpdate(index, 'affinity', v)}
              />
            </div>
            <div style={S.half}>
              <Field
                disabled={disabled}
                label={t('field.mood')}
                value={row.mood}
                onChange={(v) => onUpdate(index, 'mood', v)}
              />
            </div>
          </div>
          <Field
            disabled={disabled}
            label={t('field.appearance')}
            value={row.appearance}
            onChange={(v) => onUpdate(index, 'appearance', v)}
          />
          <Field
            disabled={disabled}
            label={t('field.condition')}
            value={row.condition}
            onChange={(v) => onUpdate(index, 'condition', v)}
          />
        </div>
      ))}
    </>
  )
}

/** Relations section (read-only, maintained by Chronicler). */
export function RelationsSection(props: {
  t: Translate
  relations: readonly WorldStateRelation[]
}): ReactNode {
  const { t, relations } = props
  return (
    <>
      <div style={S.section}>
        <span style={S.sectionTitle}>{t('section.relations')}</span>
        <Pill>{String(relations.length)}</Pill>
      </div>
      {relations.length === 0 ? (
        <div style={S.relationEmpty}>{t('relations.none')}</div>
      ) : (
        relations.map((rel, index) => (
          <div key={'relation-' + String(index)} style={S.relationRow}>
            <span style={S.relationName}>{rel.a}</span>
            <span style={S.relationLabel}>· {rel.label} ·</span>
            <span style={S.relationName}>{rel.b}</span>
          </div>
        ))
      )}
    </>
  )
}

/** Inventory items section. */
export function InventorySection(props: {
  t: Translate
  inventory: InventoryRow[]
  rowKeys: readonly string[]
  disabled: boolean
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, field: keyof InventoryRow, value: string) => void
}): ReactNode {
  const { t, inventory, rowKeys, disabled, onAdd, onRemove, onUpdate } = props
  return (
    <>
      <SectionHead
        title={t('section.inventory')}
        count={inventory.length}
        addLabel={t('add')}
        disabled={disabled}
        onAdd={onAdd}
      />
      {inventory.map((row, index) => (
        <div key={rowKeys[index] ?? 'item-' + String(index)} style={S.card}>
          <div style={S.cardHead}>
            <span style={S.cardLabel}>{t('section.inventory') + ' ' + String(index + 1)}</span>
            <RemoveButton disabled={disabled} label={t('remove')} onClick={() => onRemove(index)} />
          </div>
          <div style={S.grid2}>
            <div style={{ ...S.half, flex: 2 }}>
              <Field
                disabled={disabled}
                label={t('name')}
                value={row.name}
                onChange={(v) => onUpdate(index, 'name', v)}
              />
            </div>
            <div style={S.half}>
              <Field
                disabled={disabled}
                label={t('field.quantity')}
                value={row.quantity}
                onChange={(v) => onUpdate(index, 'quantity', v)}
              />
            </div>
          </div>
          <Field
            disabled={disabled}
            label={t('field.note')}
            value={row.note}
            onChange={(v) => onUpdate(index, 'note', v)}
          />
        </div>
      ))}
    </>
  )
}

/** Flags section. */
export function FlagsSection(props: {
  t: Translate
  flags: FlagRow[]
  rowKeys: readonly string[]
  disabled: boolean
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, field: keyof FlagRow, value: string) => void
}): ReactNode {
  const { t, flags, rowKeys, disabled, onAdd, onRemove, onUpdate } = props
  return (
    <>
      <SectionHead
        title={t('section.flags')}
        count={flags.length}
        addLabel={t('add')}
        disabled={disabled}
        onAdd={onAdd}
      />
      {flags.map((row, index) => (
        <div key={rowKeys[index] ?? 'flag-' + String(index)} style={S.card}>
          <div style={S.cardHead}>
            <span style={S.cardLabel}>{t('section.flags') + ' ' + String(index + 1)}</span>
            <RemoveButton disabled={disabled} label={t('remove')} onClick={() => onRemove(index)} />
          </div>
          <Field
            disabled={disabled}
            label={t('flag.key')}
            value={row.key}
            onChange={(v) => onUpdate(index, 'key', v)}
          />
          <Field
            disabled={disabled}
            label={t('flag.value')}
            value={row.value}
            onChange={(v) => onUpdate(index, 'value', v)}
          />
        </div>
      ))}
    </>
  )
}
