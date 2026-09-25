import { Button, Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { WorldlineBranch, WorldlineBranchGroup } from '../worldline-utils.ts'

export interface WorldlineBranchListProps {
  groups: readonly WorldlineBranchGroup[]
  hidden: readonly WorldlineBranch[]
  selectedSessionId?: string
  t: (key: string) => string
  onSelect: (branch: WorldlineBranch) => void
  onOpen: (sessionId: string) => void
  onRename: (sessionId: string, title: string) => void
  onHide: (branch: WorldlineBranch) => void
  onRestore: (sessionId: string) => void
  onExport: (sessionId: string) => void
}

export function WorldlineBranchList(props: WorldlineBranchListProps): ReactNode {
  const [hovered, setHovered] = useState<string | undefined>()
  const [editing, setEditing] = useState<string | undefined>()
  const [title, setTitle] = useState('')
  const hiddenByCard = new Map<string, WorldlineBranch[]>()
  for (const branch of props.hidden) {
    const list = hiddenByCard.get(branch.cardId) ?? []
    list.push(branch)
    hiddenByCard.set(branch.cardId, list)
  }
  const groups = [...props.groups]
  for (const [cardId, hidden] of hiddenByCard) {
    if (groups.some((group) => group.cardId === cardId)) continue
    groups.push({ cardId, cardName: hidden[0]?.cardName ?? '', branches: [] })
  }
  const beginRename = (branch: WorldlineBranch): void => {
    setEditing(branch.sessionId)
    setTitle(branch.title)
  }
  const commitRename = (branch: WorldlineBranch): void => {
    const next = title.trim()
    if (next.length > 0) props.onRename(branch.sessionId, next)
    setEditing(undefined)
  }
  return (
    <aside style={S.root} aria-label={props.t('worldline.branchList')}>
      <div style={S.heading}>{props.t('worldline.branchList')}</div>
      <div style={S.scroll}>
        {groups.map((group) => {
          const hidden = hiddenByCard.get(group.cardId) ?? []
          return (
            <section key={group.cardId} style={S.group}>
              <div style={S.groupTitle}>{group.cardName}</div>
              {group.branches.map((branch) => (
                <BranchRow
                  key={branch.sessionId}
                  branch={branch}
                  active={branch.sessionId === props.selectedSessionId}
                  hovered={branch.sessionId === hovered}
                  editing={branch.sessionId === editing}
                  title={title}
                  t={props.t}
                  onMouseEnter={() => setHovered(branch.sessionId)}
                  onMouseLeave={() => setHovered(undefined)}
                  onTitleChange={setTitle}
                  onSelect={() => props.onSelect(branch)}
                  onOpen={() => props.onOpen(branch.sessionId)}
                  onRename={() => commitRename(branch)}
                  onBeginRename={() => beginRename(branch)}
                  onCancelRename={() => setEditing(undefined)}
                  onHide={() => props.onHide(branch)}
                  onExport={() => props.onExport(branch.sessionId)}
                />
              ))}
              {hidden.length > 0 ? (
                <div style={S.hiddenGroup}>
                  <div style={S.hiddenTitle}>
                    {props.t('worldline.hiddenGroup').replace('{n}', String(hidden.length))}
                  </div>
                  {hidden.map((branch) => (
                    <div key={branch.sessionId} style={S.hiddenRow}>
                      <span style={S.branchName}>{branch.title}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => props.onRestore(branch.sessionId)}
                      >
                        {props.t('worldline.restore')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          )
        })}
        {groups.length === 0 && props.hidden.length === 0 ? (
          <div style={S.empty}>{props.t('worldline.empty')}</div>
        ) : null}
      </div>
    </aside>
  )
}

function BranchRow(props: {
  branch: WorldlineBranch
  active: boolean
  hovered: boolean
  editing: boolean
  title: string
  t: (key: string) => string
  onMouseEnter: () => void
  onMouseLeave: () => void
  onTitleChange: (value: string) => void
  onSelect: () => void
  onOpen: () => void
  onRename: () => void
  onBeginRename: () => void
  onCancelRename: () => void
  onHide: () => void
  onExport: () => void
}): ReactNode {
  const { branch } = props
  return (
    <div
      style={{ ...S.row, ...(props.active ? S.active : {}) }}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onClick={props.onSelect}
    >
      {props.editing ? (
        <div style={S.renameRow} onClick={(event) => event.stopPropagation()}>
          <Input
            value={props.title}
            onChange={(event) => props.onTitleChange(event.target.value)}
          />
          <Button size="sm" variant="primary" onClick={props.onRename}>
            {props.t('worldline.saveName')}
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onCancelRename}>
            {props.t('worldline.cancel')}
          </Button>
        </div>
      ) : (
        <>
          <div style={S.rowHead}>
            <span style={S.branchName}>{branch.title}</span>
            {branch.cold ? <Pill>{props.t('worldline.cold')}</Pill> : null}
            {branch.seedKnown === false ? (
              <Pill>{props.t('worldline.unknownPosition')}</Pill>
            ) : null}
          </div>
          <div style={S.meta}>
            {branch.latestTurn === undefined
              ? props.t('worldline.noTurn')
              : props.t('worldline.turnShort').replace('{n}', String(branch.latestTurn))}
            {branch.activity ? (
              <span>
                {props
                  .t('worldline.relative.' + branch.activity.unit)
                  .replace('{n}', String(branch.activity.value))}
              </span>
            ) : null}
            {branch.badge?.location ? <span>{branch.badge.location}</span> : null}
            {branch.badge?.affinity?.[0] ? (
              <span>
                {branch.badge.affinity[0].name} {String(branch.badge.affinity[0].value)}
              </span>
            ) : null}
          </div>
          {props.hovered || props.active ? (
            <div style={S.actions} onClick={(event) => event.stopPropagation()}>
              <Button size="sm" variant="ghost" onClick={props.onOpen}>
                {props.t('worldline.open')}
              </Button>
              <Button size="sm" variant="ghost" onClick={props.onBeginRename}>
                {props.t('worldline.rename')}
              </Button>
              <Button size="sm" variant="ghost" onClick={props.onHide}>
                {props.t('worldline.hide')}
              </Button>
              <Button size="sm" variant="ghost" onClick={props.onExport}>
                {props.t('worldline.export')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

const S: Record<string, CSSProperties> = {
  root: {
    width: 260,
    minWidth: 210,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    borderRight: '1px solid var(--dsw-alias-border-l1)',
  },
  heading: { padding: '12px 14px 8px', fontSize: 12, fontWeight: 600 },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 12px' },
  group: { marginBottom: 14 },
  groupTitle: {
    padding: '8px 6px 5px',
    fontSize: 10.5,
    color: 'var(--dsw-alias-label-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    padding: '8px 8px',
    marginBottom: 4,
    borderRadius: 7,
    cursor: 'pointer',
    border: '1px solid transparent',
  },
  active: {
    background: 'var(--dsw-alias-bg-layer-1)',
    borderColor: 'var(--dsw-alias-brand-primary)',
  },
  rowHead: { display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 },
  branchName: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
  },
  meta: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    fontSize: 10.5,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  actions: { display: 'flex', gap: 3, flexWrap: 'wrap' },
  renameRow: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  hiddenGroup: {
    margin: '8px 4px 0',
    padding: '7px',
    borderRadius: 6,
    background: 'var(--dsw-alias-bg-layer-1)',
  },
  hiddenTitle: { fontSize: 10.5, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 4 },
  hiddenRow: { display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 },
  empty: { padding: 18, fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)' },
}
