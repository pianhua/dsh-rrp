import { Button, Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { TrackedObject, WorldStateScalarField } from '../world-state.ts'
import { S, type Translate } from './components/world-state-primitives.tsx'

function scalarText(field: WorldStateScalarField): string {
  return String(field.value)
}

export function WorldStateObjectDetail(props: {
  t: Translate
  object: TrackedObject
  disabled: boolean
  onChange: (path: string, value: unknown) => void
  onArchive: () => void
  onDelete: () => void
}): ReactNode {
  const object = props.object
  const character = object.character
  const setScalar = (fieldId: string, field: WorldStateScalarField, raw: string): void => {
    const value =
      field.type === 'number' ? Number(raw) || 0 : field.type === 'boolean' ? raw === 'true' : raw
    props.onChange('fields.' + fieldId, { ...field, value })
  }
  return (
    <article style={S.card} data-object-id={object.id}>
      <div style={S.cardHead}>
        <strong>{object.name}</strong>
        {object.isPlayer === true ? <Pill active>{props.t('player.marker')}</Pill> : null}
        {object.archived === true ? <Pill>{props.t('object.archived')}</Pill> : null}
        <span style={S.spacer} />
        <Button size="sm" variant="ghost" disabled={props.disabled} onClick={props.onArchive}>
          {object.archived === true ? props.t('object.restore') : props.t('object.archive')}
        </Button>
        <Button size="sm" variant="ghost" disabled={props.disabled} onClick={props.onDelete}>
          {props.t('object.delete')}
        </Button>
      </div>
      <label style={S.field}>
        <span style={S.fieldLabel}>{props.t('object.name')}</span>
        <Input
          value={object.name}
          disabled={props.disabled}
          onChange={(event) => props.onChange('name', event.target.value)}
        />
      </label>
      {character !== undefined ? (
        <div style={S.grid2}>
          <label style={S.field}>
            <span style={S.fieldLabel}>{props.t('character.presence')}</span>
            <select
              value={character.presence ?? 'unknown'}
              disabled={props.disabled}
              style={S.select}
              onChange={(event) => props.onChange('character.presence', event.target.value)}
            >
              <option value="present">{props.t('presence.present')}</option>
              <option value="absent">{props.t('presence.absent')}</option>
              <option value="unknown">{props.t('presence.unknown')}</option>
            </select>
          </label>
          {character.affinity === undefined ? null : (
            <label style={S.field}>
              <span style={S.fieldLabel}>{props.t('character.affinity')}</span>
              <Input
                type="number"
                value={String(character.affinity)}
                disabled={props.disabled}
                onChange={(event) =>
                  props.onChange(
                    'character.affinity',
                    event.target.value === '' ? undefined : Number(event.target.value),
                  )
                }
              />
            </label>
          )}
          <label style={S.field}>
            <span style={S.fieldLabel}>{props.t('character.outfit')}</span>
            <Input
              value={character.outfit ?? ''}
              disabled={props.disabled}
              onChange={(event) => props.onChange('character.outfit', event.target.value)}
            />
          </label>
          <label style={S.field}>
            <span style={S.fieldLabel}>{props.t('character.emotionalState')}</span>
            <Input
              value={character.emotionalState ?? ''}
              disabled={props.disabled}
              onChange={(event) => props.onChange('character.emotionalState', event.target.value)}
            />
          </label>
          <label style={S.field}>
            <span style={S.fieldLabel}>{props.t('character.appearance')}</span>
            <Input
              value={character.appearance ?? ''}
              disabled={props.disabled}
              onChange={(event) => props.onChange('character.appearance', event.target.value)}
            />
          </label>
        </div>
      ) : null}
      <div style={S.fieldGroup}>
        <span style={S.fieldLabel}>{props.t('object.fields')}</span>
        {Object.entries(object.fields).map(([fieldId, field]) => (
          <label key={fieldId} style={S.field}>
            <span style={S.fieldLabel}>
              {fieldId} · {props.t('field.' + field.definition)}
            </span>
            <Input
              type={field.type === 'number' ? 'number' : 'text'}
              value={scalarText(field)}
              disabled={props.disabled}
              onChange={(event) => setScalar(fieldId, field, event.target.value)}
            />
          </label>
        ))}
        {Object.keys(object.fields).length === 0 ? (
          <span style={S.muted}>{props.t('object.noFields')}</span>
        ) : null}
      </div>
    </article>
  )
}
