import { Button, Pill, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { CARD_KEY, type CardContext } from '../card-types.ts'
import { SUMMARY_KEY, type MacroSummary } from '../macro-summary.ts'
import { promptBudgetReport } from '../prompt-budget.ts'
import { RRP_ROUTES, type CorrectionResponse, routeUrl } from '../route-contract.ts'
import { WORLD_STATE_KEY, type ObjectReference, type WorldStateView } from '../world-state.ts'
import { stateOfDraft } from './world-state-draft.ts'
import {
  getWorldStateDraftStore,
  stateOfStore,
  type WorldStateDraftStore,
} from './world-state-draft-store.ts'
import { WorldStateObjectDetail } from './world-state-object-detail.tsx'
import { WorldStateOverview } from './world-state-overview.tsx'
import { WorldStateTimelinePanel } from './world-state-timeline.tsx'
import type { RrpJobView, RrpUseProjection, RrpUseSessions } from './context-types.ts'
import {
  CollapsibleSection,
  Field,
  S,
  type Translate,
} from './components/world-state-primitives.tsx'
import type { WorldStateTimeline } from '../world-state-timeline.ts'

interface WorkspaceProps {
  t: Translate
  sessionId?: string
  useProjection?: RrpUseProjection
  useSessions?: RrpUseSessions
  compact?: boolean
}

export interface ReferenceConflict {
  objectId: string
}

export function referenceConflictFromBody(body: unknown): ReferenceConflict | undefined {
  if (body === null || typeof body !== 'object') return undefined
  const details = (body as { details?: unknown }).details
  if (details === null || typeof details !== 'object') return undefined
  const objectId = (details as { objectId?: unknown }).objectId
  return typeof objectId === 'string' && objectId.length > 0 ? { objectId } : undefined
}

function refValue(reference: ObjectReference): string {
  return reference.objectId ?? reference.external?.name ?? ''
}

function refFrom(value: string): ObjectReference {
  return value.trim().length === 0 ? { external: { name: '' } } : { objectId: value.trim() }
}

function CollectionEditor(props: {
  t: Translate
  store: WorldStateDraftStore
  compact: boolean
}): ReactNode {
  const snapshot = props.store.getSnapshot()
  const draft = snapshot.draft
  const disabled = snapshot.isInferring
  const set = (path: string, value: unknown): void => props.store.setPath(path, value)
  const append = (
    path: 'objectives' | 'conflicts' | 'cognition' | 'relations' | 'currentEvents',
    value: unknown,
  ): void => {
    const existing = draft[path] as unknown[]
    set(path, [...existing, value])
  }
  const updateRef = (path: string, value: string): void => set(path, refFrom(value))
  return (
    <>
      <CollapsibleSection title={props.t('section.objectives')} defaultExpanded={!props.compact}>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            append('objectives', {
              id: 'objective-' + String(Date.now()),
              owners: [],
              desiredOutcome: '',
              status: 'pending',
              order: draft.objectives.length,
            })
          }
        >
          {props.t('add')}
        </Button>
        {draft.objectives.map((item, index) => (
          <div key={item.id} style={S.card}>
            <Field
              label={props.t('objective.outcome')}
              value={item.desiredOutcome}
              disabled={disabled}
              onChange={(value) => set('objectives.' + index + '.desiredOutcome', value)}
            />
            <Field
              label={props.t('objective.progress')}
              value={item.progress ?? ''}
              disabled={disabled}
              onChange={(value) => set('objectives.' + index + '.progress', value)}
            />
            <Field
              label={props.t('objective.nextStep')}
              value={item.nextStep ?? ''}
              disabled={disabled}
              onChange={(value) => set('objectives.' + index + '.nextStep', value)}
            />
            <label style={S.field}>
              <span style={S.fieldLabel}>{props.t('objective.status')}</span>
              <select
                style={S.select}
                disabled={disabled}
                value={item.status}
                onChange={(event) => set('objectives.' + index + '.status', event.target.value)}
              >
                <option value="pending">{props.t('status.pending')}</option>
                <option value="active">{props.t('status.active')}</option>
                <option value="blocked">{props.t('status.blocked')}</option>
                <option value="completed">{props.t('status.completed')}</option>
                <option value="abandoned">{props.t('status.abandoned')}</option>
              </select>
            </label>
            <label style={S.checkbox}>
              <input
                type="checkbox"
                checked={item.primary === true}
                disabled={disabled}
                onChange={(event) => set('objectives.' + index + '.primary', event.target.checked)}
              />
              {props.t('objective.primary')}
            </label>
          </div>
        ))}
      </CollapsibleSection>
      <CollapsibleSection title={props.t('section.conflicts')} defaultExpanded={!props.compact}>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            append('conflicts', {
              id: 'conflict-' + String(Date.now()),
              parties: [],
              stakes: '',
              pressure: '',
              status: 'active',
            })
          }
        >
          {props.t('add')}
        </Button>
        {draft.conflicts.map((item, index) => (
          <div key={item.id} style={S.card}>
            <Field
              label={props.t('conflict.stakes')}
              value={item.stakes}
              disabled={disabled}
              onChange={(value) => set('conflicts.' + index + '.stakes', value)}
            />
            <Field
              label={props.t('conflict.pressure')}
              value={item.pressure}
              disabled={disabled}
              onChange={(value) => set('conflicts.' + index + '.pressure', value)}
            />
            <label style={S.field}>
              <span style={S.fieldLabel}>{props.t('conflict.status')}</span>
              <select
                style={S.select}
                disabled={disabled}
                value={item.status}
                onChange={(event) => set('conflicts.' + index + '.status', event.target.value)}
              >
                <option value="active">{props.t('status.active')}</option>
                <option value="controlled">{props.t('status.controlled')}</option>
                <option value="resolved">{props.t('status.resolved')}</option>
                <option value="abandoned">{props.t('status.abandoned')}</option>
              </select>
            </label>
            <Field
              label={props.t('conflict.parties')}
              value={item.parties.map(refValue).join(', ')}
              disabled={disabled}
              onChange={(value) =>
                set(
                  'conflicts.' + index + '.parties',
                  value.split(',').filter(Boolean).map(refFrom),
                )
              }
            />
          </div>
        ))}
      </CollapsibleSection>
      <CollapsibleSection title={props.t('section.relations')} defaultExpanded={!props.compact}>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            append('relations', {
              id: 'relation-' + String(Date.now()),
              a: { external: { name: '' } },
              b: { external: { name: '' } },
              labels: [],
            })
          }
        >
          {props.t('add')}
        </Button>
        {draft.relations.map((item, index) => (
          <div key={item.id} style={S.card}>
            <div style={S.grid2}>
              <Field
                label={props.t('relation.a')}
                value={refValue(item.a)}
                disabled={disabled}
                onChange={(value) => updateRef('relations.' + index + '.a', value)}
              />
              <Field
                label={props.t('relation.b')}
                value={refValue(item.b)}
                disabled={disabled}
                onChange={(value) => updateRef('relations.' + index + '.b', value)}
              />
            </div>
            <Field
              label={props.t('relation.labels')}
              value={item.labels.join(', ')}
              disabled={disabled}
              onChange={(value) =>
                set(
                  'relations.' + index + '.labels',
                  value
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean),
                )
              }
            />
            <div style={S.grid2}>
              <Field
                label={props.t('relation.aToB')}
                value={item.aToB?.attitude ?? ''}
                disabled={disabled}
                onChange={(value) =>
                  set(
                    'relations.' + index + '.aToB',
                    value.length === 0 ? undefined : { ...item.aToB, attitude: value },
                  )
                }
              />
              <Field
                label={props.t('relation.bToA')}
                value={item.bToA?.attitude ?? ''}
                disabled={disabled}
                onChange={(value) =>
                  set(
                    'relations.' + index + '.bToA',
                    value.length === 0 ? undefined : { ...item.bToA, attitude: value },
                  )
                }
              />
            </div>
          </div>
        ))}
      </CollapsibleSection>
      <CollapsibleSection title={props.t('section.cognition')} defaultExpanded={!props.compact}>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            append('cognition', {
              id: 'cognition-' + String(Date.now()),
              character: { external: { name: '' } },
              proposition: '',
              markers: [],
            })
          }
        >
          {props.t('add')}
        </Button>
        {draft.cognition.map((item, index) => (
          <div key={item.id} style={S.card}>
            <Field
              label={props.t('cognition.character')}
              value={refValue(item.character)}
              disabled={disabled}
              onChange={(value) => updateRef('cognition.' + index + '.character', value)}
            />
            <Field
              label={props.t('cognition.proposition')}
              value={item.proposition}
              disabled={disabled}
              onChange={(value) => set('cognition.' + index + '.proposition', value)}
            />
            <Field
              label={props.t('cognition.markers')}
              value={item.markers.join(', ')}
              disabled={disabled}
              onChange={(value) =>
                set(
                  'cognition.' + index + '.markers',
                  value
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean),
                )
              }
            />
          </div>
        ))}
      </CollapsibleSection>
      <CollapsibleSection title={props.t('section.currentEvents')} defaultExpanded={!props.compact}>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            append('currentEvents', {
              id: 'event-' + String(Date.now()),
              type: 'ongoing',
              fact: '',
              relatedObjects: [],
              status: 'active',
            })
          }
        >
          {props.t('add')}
        </Button>
        {draft.currentEvents.map((item, index) => (
          <div key={item.id} style={S.card}>
            <Field
              label={props.t('event.type')}
              value={item.type}
              disabled={disabled}
              onChange={(value) => set('currentEvents.' + index + '.type', value)}
            />
            <Field
              label={props.t('event.fact')}
              value={item.fact}
              disabled={disabled}
              onChange={(value) => set('currentEvents.' + index + '.fact', value)}
            />
            <Field
              label={props.t('event.relatedObjects')}
              value={item.relatedObjects.map(refValue).join(', ')}
              disabled={disabled}
              onChange={(value) =>
                set(
                  'currentEvents.' + index + '.relatedObjects',
                  value.split(',').filter(Boolean).map(refFrom),
                )
              }
            />
          </div>
        ))}
      </CollapsibleSection>
    </>
  )
}

export function WorldStateWorkspace(props: WorkspaceProps): ReactNode {
  const sessionId = props.sessionId ?? '__no-session__'
  const view = props.useProjection?.(WORLD_STATE_KEY) as WorldStateView | undefined
  const card = props.useProjection?.(CARD_KEY) as CardContext | null | undefined
  const summary = props.useProjection?.(SUMMARY_KEY) as MacroSummary | undefined
  const storeRef = useRef<{ sessionId: string; store: WorldStateDraftStore } | undefined>(undefined)
  if (storeRef.current === undefined || storeRef.current.sessionId !== sessionId) {
    storeRef.current = { sessionId, store: getWorldStateDraftStore(sessionId, view) }
  } else {
    storeRef.current.store.mergeProjection(view)
  }
  const store = storeRef.current.store
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const jobs = props.useSessions?.((state) => state.jobsBySession[sessionId]) as
    readonly RrpJobView[] | undefined
  const isInferring =
    jobs?.some(
      (job) => job.kind === 'chronicler' && (job.status === 'running' || job.status === 'stopping'),
    ) ?? false
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<CorrectionResponse | undefined>()
  const [timeline, setTimeline] = useState<WorldStateTimeline | undefined>()
  const [selectedObjectId, setSelectedObjectId] = useState<string | undefined>()
  const [pendingDelete, setPendingDelete] = useState<string | undefined>()
  const [pendingReferenceDelete, setPendingReferenceDelete] = useState<string | undefined>()
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[]>([])
  const t = props.t
  useEffect(() => store.setInferring(isInferring), [isInferring, store])
  useEffect(() => {
    if (props.sessionId === undefined) return
    void fetch(routeUrl(RRP_ROUTES.worldStateTimeline, props.sessionId))
      .then((response) =>
        response.ok ? (response.json() as Promise<{ timeline: WorldStateTimeline }>) : undefined,
      )
      .then((body) => setTimeline(body?.timeline))
      .catch(() => setTimeline(undefined))
  }, [props.sessionId, snapshot.updateNotice])
  const report = promptBudgetReport({
    card: card ?? null,
    summary: summary ?? undefined,
    state: stateOfDraft(snapshot.draft),
    injectedChars: undefined,
  })
  const correctionBody = (
    previewOnly: boolean,
    deleteIds = confirmDeleteIds,
  ): Record<string, unknown> => ({
    sessionId: props.sessionId,
    state: stateOfStore(store),
    ...(previewOnly ? { preview: true } : {}),
    ...(deleteIds.length === 0 ? {} : { confirmDeleteIds: deleteIds }),
  })
  const handleCorrectionFailure = async (response: Response): Promise<boolean> => {
    if (response.status !== 409) {
      setStatus(t('saveFailed'))
      return false
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    const conflict = referenceConflictFromBody(body)
    if (conflict === undefined) {
      setStatus(t('saveFailed'))
      return false
    }
    setPendingReferenceDelete(conflict.objectId)
    setStatus(t('object.deleteConfirm'))
    return false
  }
  const savePreview = async (deleteIds = confirmDeleteIds): Promise<void> => {
    if (props.sessionId === undefined) return setStatus(t('noSession'))
    const response = await fetch(RRP_ROUTES.worldState, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(correctionBody(true, deleteIds)),
    })
    if (!response.ok) {
      await handleCorrectionFailure(response)
      return
    }
    setPreview((await response.json()) as CorrectionResponse)
    setStatus(t('save.review'))
  }
  const save = async (): Promise<void> => {
    if (props.sessionId === undefined) return setStatus(t('noSession'))
    const response = await fetch(RRP_ROUTES.worldState, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(correctionBody(false)),
    })
    if (!response.ok) {
      await handleCorrectionFailure(response)
      return
    }
    store.markSaved()
    setPreview(undefined)
    setConfirmDeleteIds([])
    setPendingReferenceDelete(undefined)
    setStatus(t('saved'))
  }
  const objects = Object.values(snapshot.draft.trackedObjects).filter((object) => !object.archived)
  const selected =
    selectedObjectId === undefined
      ? (objects.find((object) => object.isPlayer !== true) ?? objects[0])
      : snapshot.draft.trackedObjects[selectedObjectId]
  const addObject = (): void => {
    const id = 'object-' + String(Date.now())
    store.setPath('trackedObjects.' + id, {
      id,
      kind: 'character',
      name: '',
      character: { presence: 'unknown' },
      fields: {},
    })
    setSelectedObjectId(id)
  }
  const deleteObject = (id: string): void => {
    store.deletePath('trackedObjects.' + id)
    setPendingDelete(undefined)
    if (selectedObjectId === id) setSelectedObjectId(undefined)
  }
  return (
    <div style={{ ...S.root, ...(props.compact ? S.compactRoot : {}) }}>
      <header style={S.header}>
        <strong style={S.title}>{t('title')}</strong>
        {snapshot.isDirty ? <Pill active>{t('unsaved')}</Pill> : null}
        <span style={S.spacer} />
        {isInferring ? (
          <span style={S.running}>
            <StateDot state="ongoing" />
            {t('chronicler.running')}
          </span>
        ) : null}
      </header>
      <div style={S.scroll}>
        {snapshot.draft.visibilityNotices?.length ? (
          <div style={S.notice}>{t('visibility.notice')}</div>
        ) : null}
        {snapshot.updateNotice ? <div style={S.notice}>{t('projection.updated')}</div> : null}
        <WorldStateOverview t={t} draft={snapshot.draft} />
        <CollapsibleSection title={t('section.trackedObjects')} defaultExpanded={!props.compact}>
          <div style={S.selectorRow}>
            {objects.map((object) => (
              <Button
                key={object.id}
                size="sm"
                variant={selected?.id === object.id ? 'primary' : 'ghost'}
                onClick={() => setSelectedObjectId(object.id)}
              >
                {object.name || t('object.unnamed')}
                {object.isPlayer === true ? ' · ' + t('player.marker') : ''}
              </Button>
            ))}
            <Button size="sm" variant="ghost" disabled={snapshot.isInferring} onClick={addObject}>
              {t('add')}
            </Button>
          </div>
          {selected ? (
            <WorldStateObjectDetail
              t={t}
              object={selected}
              disabled={snapshot.isInferring}
              onChange={(path, value) =>
                store.setPath('trackedObjects.' + selected.id + '.' + path, value)
              }
              onArchive={() =>
                store.setPath(
                  'trackedObjects.' + selected.id + '.archived',
                  selected.archived !== true,
                )
              }
              onDelete={() => setPendingDelete(selected.id)}
            />
          ) : (
            <div style={S.muted}>{t('object.none')}</div>
          )}
          {pendingDelete !== undefined ? (
            <div style={S.confirm}>
              <span>{t('object.deleteConfirm')}</span>
              <Button size="sm" variant="ghost" onClick={() => setPendingDelete(undefined)}>
                {t('stay')}
              </Button>
              <Button size="sm" variant="primary" onClick={() => deleteObject(pendingDelete)}>
                {t('confirm')}
              </Button>
            </div>
          ) : null}
          {pendingReferenceDelete !== undefined ? (
            <div style={S.confirm}>
              <span>{t('object.deleteConfirm')}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPendingReferenceDelete(undefined)}
              >
                {t('discard')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const nextDeleteIds = confirmDeleteIds.includes(pendingReferenceDelete)
                    ? confirmDeleteIds
                    : [...confirmDeleteIds, pendingReferenceDelete]
                  setConfirmDeleteIds(nextDeleteIds)
                  setPendingReferenceDelete(undefined)
                  void savePreview(nextDeleteIds)
                }}
              >
                {t('confirm')}
              </Button>
            </div>
          ) : null}
        </CollapsibleSection>
        <CollectionEditor t={t} store={store} compact={props.compact === true} />
        <CollapsibleSection title={t('section.globalFields')} defaultExpanded={false}>
          <div style={S.fieldGroup}>
            {Object.entries(snapshot.draft.globalFields).map(([id, field]) => (
              <Field
                key={id}
                label={id + ' · ' + t('field.' + field.definition)}
                value={String(field.value)}
                disabled={snapshot.isInferring}
                onChange={(value) =>
                  store.setPath(
                    'globalFields.' + id + '.value',
                    field.type === 'number'
                      ? Number(value) || 0
                      : field.type === 'boolean'
                        ? value === 'true'
                        : value,
                  )
                }
              />
            ))}
          </div>
        </CollapsibleSection>
        <CollapsibleSection title={t('budget.title')} defaultExpanded={false}>
          <div style={S.card}>
            <span>
              {report.totalTokens.toLocaleString()} · {report.pct}% · {t('budget.' + report.level)}
            </span>
          </div>
        </CollapsibleSection>
        <CollapsibleSection title={t('timeline.title')} defaultExpanded={false}>
          <WorldStateTimelinePanel t={t} timeline={timeline} compact={props.compact} />
        </CollapsibleSection>
        {snapshot.isDirty ? (
          <div style={S.navigation}>
            <span>{t('navigation.unsaved')}</span>
            <Button
              size="sm"
              variant="primary"
              disabled={snapshot.isInferring}
              onClick={() => void savePreview()}
            >
              {t('save')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={snapshot.isInferring}
              onClick={() => {
                store.discard()
                setPreview(undefined)
                setStatus(t('discarded'))
              }}
            >
              {t('discard')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus(t('stay'))}>
              {t('stay')}
            </Button>
          </div>
        ) : null}
        {preview?.diff?.changes?.length ? (
          <div style={S.preview}>
            <strong>{t('save.review')}</strong>
            {(['added', 'modified', 'closed', 'archived', 'deleted'] as const).map((kind) => {
              const changes = preview.diff?.changes.filter((change) => change.type === kind) ?? []
              return changes.length === 0 ? null : (
                <div key={kind}>
                  <Pill>{t('change.' + kind)}</Pill>{' '}
                  {changes.map((change) => (
                    <span key={change.field ?? change.objectId}>
                      {change.field ?? change.objectId}{' '}
                    </span>
                  ))}
                </div>
              )
            })}
            <Button size="sm" variant="primary" onClick={() => void save()}>
              {t('confirm')}
            </Button>
          </div>
        ) : null}
      </div>
      <footer style={S.footer}>
        <span style={S.status}>{snapshot.isInferring ? t('chronicler.running') : status}</span>
        <Button
          variant="primary"
          disabled={props.sessionId === undefined || !snapshot.isDirty || snapshot.isInferring}
          onClick={() => void savePreview()}
        >
          {t('save')}
        </Button>
      </footer>
    </div>
  )
}
