import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { WorldlineBranch } from '../worldline-utils.ts'

export interface WorldlineForkDialogProps {
  branch: WorldlineBranch
  atSeq: number
  defaultTitle: string
  t: (key: string) => string
  onCancel: () => void
  onConfirm: (title: string) => void
}

export function WorldlineForkDialog(props: WorldlineForkDialogProps): ReactNode {
  const [title, setTitle] = useState(props.defaultTitle)
  useEffect(() => setTitle(props.defaultTitle), [props.defaultTitle])
  const submit = (): void => {
    const next = title.trim()
    if (next.length > 0) props.onConfirm(next)
  }
  return (
    <div
      style={S.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={props.t('worldline.forkTitle')}
    >
      <div style={S.dialog}>
        <strong style={S.title}>{props.t('worldline.forkTitle')}</strong>
        <p style={S.copy}>
          {props
            .t('worldline.forkConfirm')
            .replace('{branch}', props.branch.title)
            .replace('{turn}', String(props.branch.latest?.turn ?? ''))
            .replace('{seq}', String(props.atSeq))}
        </p>
        <label style={S.field}>
          <span>{props.t('worldline.branchName')}</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div style={S.actions}>
          <Button size="sm" variant="ghost" onClick={props.onCancel}>
            {props.t('worldline.cancel')}
          </Button>
          <Button size="sm" variant="primary" disabled={title.trim().length === 0} onClick={submit}>
            {props.t('worldline.confirmFork')}
          </Button>
        </div>
      </div>
    </div>
  )
}

const S: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'rgba(0, 0, 0, 0.45)',
  },
  dialog: {
    width: 'min(420px, 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    borderRadius: 10,
    background: 'var(--dsw-alias-bg-layer-2)',
    border: '1px solid var(--dsw-alias-border-l1)',
    boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
  },
  title: { fontSize: 14 },
  copy: { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)' },
  field: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
}
