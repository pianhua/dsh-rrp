import { Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { WorldStateDraft } from './world-state-draft.ts'
import { S, type Translate } from './components/world-state-primitives.tsx'

function referenceLabel(reference: { objectId?: string; external?: { name: string } }): string {
  return reference.objectId ?? reference.external?.name ?? ''
}

export function WorldStateOverview(props: { t: Translate; draft: WorldStateDraft }): ReactNode {
  const objects = Object.values(props.draft.trackedObjects)
  const scene = objects.find((object) => object.kind === 'scene' && !object.archived)
  const present = objects.filter(
    (object) => object.kind === 'character' && object.character?.presence === 'present',
  )
  const objectives = props.draft.objectives
    .filter(
      (item) => item.status === 'pending' || item.status === 'active' || item.status === 'blocked',
    )
    .sort(
      (a, b) =>
        Number(b.primary === true) - Number(a.primary === true) || (a.order ?? 0) - (b.order ?? 0),
    )
    .slice(0, 4)
  const conflicts = props.draft.conflicts.filter(
    (item) => item.status === 'active' || item.status === 'controlled',
  )
  return (
    <section style={S.overview} aria-label={props.t('overview.title')}>
      <div style={S.overviewCard}>
        <span style={S.overviewLabel}>{props.t('overview.scene')}</span>
        <strong>{scene?.name ?? props.t('overview.noScene')}</strong>
        {scene === undefined
          ? null
          : Object.entries(scene.fields).map(([fieldId, field]) => (
              <span key={fieldId} style={S.muted}>
                {String(field.value)}
              </span>
            ))}
      </div>
      <div style={S.overviewCard}>
        <span style={S.overviewLabel}>{props.t('overview.present')}</span>
        <div style={S.chipRow}>
          {present.length === 0 ? <span style={S.muted}>{props.t('overview.none')}</span> : null}
          {present.map((object) => (
            <Pill key={object.id} active={object.isPlayer === true}>
              {object.name}
              {object.isPlayer === true ? ' · ' + props.t('player.marker') : ''}
            </Pill>
          ))}
        </div>
      </div>
      <div style={S.overviewCard}>
        <span style={S.overviewLabel}>{props.t('overview.objectives')}</span>
        {objectives.length === 0 ? <span style={S.muted}>{props.t('overview.none')}</span> : null}
        {objectives.map((item) => (
          <div key={item.id} style={S.overviewLine}>
            {item.primary === true ? <Pill active>{props.t('objective.primary')}</Pill> : null}
            <span>{item.desiredOutcome}</span>
          </div>
        ))}
      </div>
      <div style={S.overviewCard}>
        <span style={S.overviewLabel}>{props.t('overview.conflicts')}</span>
        {conflicts.length === 0 ? <span style={S.muted}>{props.t('overview.none')}</span> : null}
        {conflicts.map((item) => (
          <div key={item.id} style={S.overviewLine}>
            <span>{item.pressure}</span>
            <span style={S.muted}>{item.parties.map(referenceLabel).join(' · ')}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
