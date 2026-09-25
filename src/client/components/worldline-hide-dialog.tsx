import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CSSProperties, ReactNode } from 'react'
import type { WorldlineBranch } from '../worldline-utils.ts'

export interface WorldlineHideDialogProps {
  branch: WorldlineBranch
  t: (key: string) => string
  onCancel: () => void
  onConfirm: () => void
}

export function WorldlineHideDialog(props: WorldlineHideDialogProps): ReactNode {
  return (
    <div
      style={S.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={props.t('worldline.hideTitle')}
    >
      <div style={S.dialog}>
        <strong style={S.title}>{props.t('worldline.hideTitle')}</strong>
        <p style={S.copy}>
          {props
            .t('worldline.hideConfirm')
            .replace('{branch}', props.branch.title)
            .replace('{n}', String(props.branch.descendantCount))}
        </p>
        <div style={S.actions}>
          <Button size="sm" variant="ghost" onClick={props.onCancel}>
            {props.t('worldline.cancel')}
          </Button>
          <Button size="sm" variant="primary" onClick={props.onConfirm}>
            {props.t('worldline.confirmHide')}
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
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
}
