/**
 * dsh-rrp — dynamic fields editor and forms (issue #23).
 */
import {
  Button,
  IconPlusOutline16,
  IconTrashOutline16,
  Input,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type ReactNode } from 'react'
import { isCoreKey, isValidFieldId } from '../../world-state.ts'
import { CollapsibleSection, S, type Translate } from './world-state-primitives.tsx'

export interface DynamicFieldRow {
  id: string
  type: 'number' | 'string' | 'boolean'
  value: string
  min?: string
  max?: string
}

/** Dynamic field editor for a single field card. */
export function DynamicFieldEditor(props: {
  t: Translate
  field: DynamicFieldRow
  disabled?: boolean
  onChange: (updated: DynamicFieldRow) => void
  onDelete: () => void
}): ReactNode {
  const { t, field, disabled, onChange, onDelete } = props

  return (
    <div style={S.dynamicFieldCard}>
      <div style={S.dynamicFieldHeader}>
        <span style={S.dynamicFieldId}>{field.id}</span>
        <span style={S.dynamicFieldType}>{field.type}</span>
        <Tooltip label={t('dynamicFields.remove')}>
          <Button
            variant="ghost"
            size="sm"
            icon={<IconTrashOutline16 size={14} />}
            disabled={disabled}
            onClick={onDelete}
          />
        </Tooltip>
      </div>

      {field.type === 'number' && (
        <div style={S.grid2}>
          <div style={S.half}>
            <label style={S.field}>
              <span style={S.fieldLabel}>{t('dynamicFields.value')}</span>
              <Input
                type="number"
                value={field.value}
                disabled={disabled}
                onChange={(e) => onChange({ ...field, value: e.target.value })}
              />
            </label>
          </div>
          <div style={S.half}>
            <div style={S.grid2}>
              <label style={S.field}>
                <span style={S.fieldLabel}>{t('dynamicFields.min')}</span>
                <Input
                  type="number"
                  value={field.min ?? ''}
                  placeholder={t('dynamicFields.unbounded')}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...field, min: e.target.value })}
                />
              </label>
              <label style={S.field}>
                <span style={S.fieldLabel}>{t('dynamicFields.max')}</span>
                <Input
                  type="number"
                  value={field.max ?? ''}
                  placeholder={t('dynamicFields.unbounded')}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...field, max: e.target.value })}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {field.type === 'string' && (
        <label style={S.field}>
          <span style={S.fieldLabel}>{t('dynamicFields.value')}</span>
          <Input
            value={field.value}
            disabled={disabled}
            onChange={(e) => onChange({ ...field, value: e.target.value })}
          />
        </label>
      )}

      {field.type === 'boolean' && (
        <label style={S.field}>
          <span style={S.fieldLabel}>{t('dynamicFields.value')}</span>
          <Input
            value={field.value}
            placeholder="true / false"
            disabled={disabled}
            onChange={(e) => onChange({ ...field, value: e.target.value })}
          />
        </label>
      )}
    </div>
  )
}

/** Form to create a new dynamic field. */
export function AddFieldForm(props: {
  t: Translate
  existingIds: readonly string[]
  disabled?: boolean
  onAdd: (field: DynamicFieldRow) => void
  onCancel: () => void
}): ReactNode {
  const { t, existingIds, disabled } = props
  const [id, setId] = useState('')
  const [type, setType] = useState<'number' | 'string' | 'boolean'>('number')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const handleAdd = () => {
    if (disabled) return
    const trimmedId = id.trim()
    if (!trimmedId) {
      setError(t('dynamicFields.idRequired'))
      return
    }
    if (isCoreKey(trimmedId)) {
      setError(t('dynamicFields.idReserved'))
      return
    }
    if (!isValidFieldId(trimmedId)) {
      setError(t('dynamicFields.idInvalid'))
      return
    }
    if (existingIds.includes(trimmedId)) {
      setError(t('dynamicFields.idDuplicate'))
      return
    }

    props.onAdd({
      id: trimmedId,
      type,
      value: value || (type === 'number' ? '0' : type === 'boolean' ? 'false' : ''),
      min: undefined,
      max: undefined,
    })

    setId('')
    setValue('')
    setError('')
  }

  return (
    <div style={S.addFieldForm}>
      {error && (
        <div style={{ fontSize: 11, color: 'var(--dsw-alias-status-error)', marginBottom: 8 }}>
          {error}
        </div>
      )}
      <div style={S.formRow}>
        <label style={{ ...S.field, ...S.formField }}>
          <span style={S.fieldLabel}>{t('dynamicFields.id')}</span>
          <Input
            value={id}
            placeholder="magic_power"
            disabled={disabled}
            onChange={(e) => setId(e.target.value)}
          />
        </label>
        <label style={{ ...S.field, flex: '0 0 120px' }}>
          <span style={S.fieldLabel}>{t('dynamicFields.type')}</span>
          <select
            value={type}
            disabled={disabled}
            onChange={(e) => setType(e.target.value as 'number' | 'string' | 'boolean')}
            style={{
              width: '100%',
              height: 32,
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-base)',
              color: 'var(--dsw-alias-label-primary)',
            }}
          >
            <option value="number">number</option>
            <option value="string">string</option>
            <option value="boolean">boolean</option>
          </select>
        </label>
        <label style={{ ...S.field, ...S.formField }}>
          <span style={S.fieldLabel}>{t('dynamicFields.initial')}</span>
          <Input
            value={value}
            placeholder={type === 'number' ? '0' : type === 'boolean' ? 'true/false' : ''}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      </div>
      <div style={S.formActions}>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={props.onCancel}>
          {t('dynamicFields.cancel')}
        </Button>
        <Button variant="primary" size="sm" disabled={disabled} onClick={handleAdd}>
          {t('add')}
        </Button>
      </div>
    </div>
  )
}

/** Complete dynamic fields section. */
export function DynamicFieldsSection(props: {
  t: Translate
  fields: DynamicFieldRow[]
  isInferring: boolean
  onAdd: (field: DynamicFieldRow) => void
  onUpdate: (index: number, field: DynamicFieldRow) => void
  onDelete: (index: number) => void
}): ReactNode {
  const { t, fields, isInferring, onAdd, onUpdate, onDelete } = props
  const [showAddField, setShowAddField] = useState(false)

  return (
    <CollapsibleSection title={t('section.dynamicFields')} defaultExpanded={true}>
      {showAddField ? (
        <AddFieldForm
          t={t}
          existingIds={fields.map((field) => field.id)}
          disabled={isInferring}
          onAdd={(newField) => {
            onAdd(newField)
            setShowAddField(false)
          }}
          onCancel={() => setShowAddField(false)}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          icon={<IconPlusOutline16 size={16} />}
          disabled={isInferring}
          onClick={() => setShowAddField(true)}
          style={{ marginBottom: 12 }}
        >
          {t('add')}
        </Button>
      )}

      {fields.length === 0 && !showAddField && (
        <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', padding: '8px 0' }}>
          {t('dynamicFields.none')}
        </div>
      )}

      {fields.map((field, index) => (
        <DynamicFieldEditor
          key={field.id}
          t={t}
          field={field}
          disabled={isInferring}
          onChange={(updated) => onUpdate(index, updated)}
          onDelete={() => onDelete(index)}
        />
      ))}
    </CollapsibleSection>
  )
}
