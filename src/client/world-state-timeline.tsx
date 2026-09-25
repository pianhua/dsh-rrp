import { Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import { useMemo, useState, type ReactNode } from 'react'
import type { WorldStateTimeline } from '../world-state-timeline.ts'
import { S, type Translate } from './components/world-state-primitives.tsx'

export function WorldStateTimelinePanel(props: {
  t: Translate
  timeline: WorldStateTimeline | undefined
  compact?: boolean
}): ReactNode {
  const [query, setQuery] = useState('')
  const [actor, setActor] = useState('all')
  const [changeType, setChangeType] = useState('all')
  const rows = useMemo(() => {
    const lowered = query.trim().toLowerCase()
    return (props.timeline?.batches ?? []).filter((batch) => {
      if (actor !== 'all' && batch.provenance.actor !== actor) return false
      if (
        changeType !== 'all' &&
        (batch.kind === 'baseline' || !batch.changes.some((item) => item.type === changeType))
      )
        return false
      if (lowered.length === 0) return true
      return JSON.stringify(batch).toLowerCase().includes(lowered)
    })
  }, [actor, changeType, props.timeline, query])
  return (
    <div style={S.timeline} aria-label={props.t('timeline.title')}>
      <div style={S.filters}>
        <Input
          value={query}
          placeholder={props.t('timeline.search')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          value={actor}
          onChange={(event) => setActor(event.target.value)}
          style={S.select}
          aria-label={props.t('timeline.actor')}
        >
          <option value="all">{props.t('timeline.allActors')}</option>
          <option value="initial-state">{props.t('actor.initial-state')}</option>
          <option value="player">{props.t('actor.player')}</option>
          <option value="chronicler">{props.t('actor.chronicler')}</option>
          <option value="copilot">{props.t('actor.copilot')}</option>
          <option value="system">{props.t('actor.system')}</option>
        </select>
        {!props.compact ? (
          <select
            value={changeType}
            onChange={(event) => setChangeType(event.target.value)}
            style={S.select}
            aria-label={props.t('timeline.changeType')}
          >
            <option value="all">{props.t('timeline.allChanges')}</option>
            {['added', 'modified', 'closed', 'archived', 'deleted', 'restored'].map((type) => (
              <option key={type} value={type}>
                {props.t('change.' + type)}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {rows.length === 0 ? <div style={S.muted}>{props.t('timeline.empty')}</div> : null}
      {rows.map((batch, index) => (
        <article key={String(index)} style={S.timelineRow}>
          <div style={S.timelineHead}>
            <Pill>{props.t('actor.' + batch.provenance.actor)}</Pill>
            <span style={S.muted}>
              {batch.provenance.storyTurn === undefined
                ? props.t('timeline.unknownTurn')
                : props.t('timeline.turn') + ' ' + String(batch.provenance.storyTurn)}
            </span>
            <span style={S.muted}>{batch.provenance.at ?? props.t('timeline.unknownTime')}</span>
          </div>
          {batch.kind === 'baseline' ? (
            <div>{props.t('timeline.baseline')}</div>
          ) : (
            batch.changes.map((change, changeIndex) => (
              <div key={String(changeIndex)} style={S.timelineChange}>
                <Pill>{props.t('change.' + change.type)}</Pill>
                <span>{change.field ?? change.objectId ?? props.t('timeline.state')}</span>
                {change.before !== undefined || change.after !== undefined ? (
                  <span style={S.muted}>
                    {String(change.before ?? '∅')} → {String(change.after ?? '∅')}
                  </span>
                ) : null}
              </div>
            ))
          )}
          {batch.provenance.evidence !== undefined ? (
            <div style={S.muted}>{batch.provenance.evidence}</div>
          ) : null}
        </article>
      ))}
    </div>
  )
}
