/**
 * dsh-rrp — shared UI primitives and styling tokens for WorldState tabs.
 */
import {
  Button,
  IconPlusOutline16,
  IconTrashOutline16,
  Input,
  Pill,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { BudgetReport, BudgetSection } from '../../prompt-budget.ts'

export type Translate = (key: string) => string

export const S: Record<string, CSSProperties> = {
  root: {
    height: '100%',
    width: '100%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-primary)',
  },
  header: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
  },
  title: { fontSize: 14, fontWeight: 600 },
  presetTag: {
    fontSize: 10.5,
    fontWeight: 500,
    padding: '2px 7px',
    borderRadius: 4,
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-secondary)',
    fontFamily: 'var(--dsw-font-mono, monospace)',
    letterSpacing: '0.01em',
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  spacer: { flex: 1 },
  scroll: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    // Never scrollable horizontally: a focus landing near the right edge of a
    // wrapping field row would otherwise persist a scrollLeft and leave the
    // whole panel looking cut on the left.
    overflowX: 'hidden',
    overflowY: 'auto',
    padding: '16px',
  },
  hint: {
    margin: '0 0 12px',
    fontSize: 11.5,
    lineHeight: 1.6,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  budget: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '10px 12px',
    marginBottom: 12,
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
  },
  budgetHead: { display: 'flex', alignItems: 'center', gap: 8 },
  budgetTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--dsw-alias-label-secondary)',
    letterSpacing: '0.03em',
    textTransform: 'uppercase' as const,
  },
  budgetText: { fontSize: 11, fontWeight: 600, fontFamily: 'var(--dsw-font-mono, monospace)' },
  budgetBar: {
    display: 'flex',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    background: 'var(--dsw-alias-bg-layer-2)',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '12px',
    marginBottom: 12,
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px dashed var(--dsw-alias-border-l2)',
    fontSize: 12,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  activity: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '12px',
    marginBottom: 16,
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
  },
  activityHead: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--dsw-alias-label-secondary)',
    letterSpacing: '0.03em',
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  activityEmpty: { fontSize: 11, color: 'var(--dsw-alias-label-dimmed)' },
  activityRow: { display: 'flex', gap: 6, fontSize: 11, lineHeight: 1.5, alignItems: 'baseline' },
  activityWho: { flex: '0 0 auto', fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' },
  activityWhat: {
    flex: 1,
    minWidth: 0,
    color: 'var(--dsw-alias-label-tertiary)',
    wordBreak: 'break-word',
  },
  activityWhen: { flex: '0 0 auto', color: 'var(--dsw-alias-label-dimmed)' },
  running: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: 'var(--dsw-alias-label-secondary)',
  },
  section: { display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 10px' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '12px',
    marginBottom: 12,
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    transition: 'border-color 0.15s ease',
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  cardLabel: {
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--dsw-alias-label-secondary)',
    opacity: 0.85,
    flex: 1,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--dsw-alias-label-tertiary)',
    opacity: 0.75,
  },
  grid2: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  half: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 },
  footer: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    borderTop: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-base)',
  },
  status: {
    flex: 1,
    minWidth: 0,
    fontSize: 11.5,
    color: 'var(--dsw-alias-label-tertiary)',
    lineHeight: 1.4,
  },
  collapsible: { marginBottom: 20 },
  collapseHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 0',
    cursor: 'pointer',
    userSelect: 'none' as const,
    borderRadius: 6,
    transition: 'background 0.15s ease',
  },
  collapseArrow: {
    fontSize: 12,
    color: 'var(--dsw-alias-label-tertiary)',
    transition: 'transform 0.2s ease',
  },
  collapseArrowExpanded: { transform: 'rotate(90deg)' },
  collapseTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    color: 'var(--dsw-alias-label-primary)',
    letterSpacing: '-0.01em',
  },
  collapseContent: { paddingLeft: 0, marginTop: 4 },
  dynamicFieldCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    padding: '12px',
    marginBottom: 12,
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    transition: 'border-color 0.15s ease',
  },
  dynamicFieldHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  dynamicFieldId: {
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: 'var(--dsw-font-mono, monospace)',
    flex: 1,
    color: 'var(--dsw-alias-label-primary)',
  },
  dynamicFieldType: {
    fontSize: 10,
    fontWeight: 500,
    padding: '3px 7px',
    borderRadius: 4,
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-secondary)',
    letterSpacing: '0.02em',
  },
  addFieldForm: {
    padding: '14px',
    marginBottom: 12,
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px dashed var(--dsw-alias-border-l2)',
  },
  relationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    marginBottom: 8,
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    fontSize: 12,
  },
  relationName: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
  relationLabel: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center' as const,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  relationEmpty: { fontSize: 11, color: 'var(--dsw-alias-label-dimmed)', padding: '2px 0 8px' },
  formRow: { display: 'flex', gap: 10, marginBottom: 10 },
  formField: { flex: 1, minWidth: 0 },
  formActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 },
  overview: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
    marginBottom: 16,
  },
  overviewCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    padding: 10,
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
  },
  overviewLabel: {
    fontSize: 10,
    color: 'var(--dsw-alias-label-tertiary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  overviewLine: { display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 12, lineHeight: 1.5 },
  chipRow: { display: 'flex', gap: 5, flexWrap: 'wrap' as const },
  notice: {
    padding: 9,
    marginBottom: 10,
    borderRadius: 7,
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    fontSize: 11,
    lineHeight: 1.5,
  },
  compactRoot: { fontSize: 12 },
  selectorRow: { display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 10 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  select: {
    width: '100%',
    minHeight: 30,
    padding: '0 7px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-primary)',
  },
  checkbox: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 },
  confirm: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    marginTop: 8,
    borderRadius: 7,
    background: 'var(--dsw-alias-bg-layer-1)',
  },
  navigation: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-1)',
  },
  preview: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l1)',
  },
  timeline: { display: 'flex', flexDirection: 'column', gap: 8 },
  filters: { display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 8 },
  timelineRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    padding: 9,
    borderRadius: 7,
    background: 'var(--dsw-alias-bg-layer-1)',
  },
  timelineHead: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const },
  timelineChange: {
    display: 'flex',
    gap: 6,
    alignItems: 'baseline',
    fontSize: 11,
    lineHeight: 1.5,
  },
}

/** Local wall-clock label for a ledger entry. */
export function clockOf(at: string): string {
  const date = new Date(at)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** One labelled text field. */
export function Field(props: {
  label: string
  value: string
  placeholder?: string
  disabled?: boolean
  onChange: (next: string) => void
}): ReactNode {
  return (
    <label style={S.field}>
      <span style={S.fieldLabel}>{props.label}</span>
      <Input
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  )
}

/** A section heading with a count and an add action. */
export function SectionHead(props: {
  title: string
  count: number
  addLabel: string
  disabled?: boolean
  onAdd: () => void
}): ReactNode {
  return (
    <div style={S.section}>
      <span style={S.sectionTitle}>{props.title}</span>
      <Pill>{String(props.count)}</Pill>
      <span style={S.spacer} />
      <Button
        variant="ghost"
        size="sm"
        icon={<IconPlusOutline16 size={16} />}
        disabled={props.disabled}
        onClick={props.onAdd}
      >
        {props.addLabel}
      </Button>
    </div>
  )
}

/** The remove control shared by every editable card. */
export function RemoveButton(props: {
  label: string
  disabled?: boolean
  onClick: () => void
}): ReactNode {
  return (
    <Tooltip label={props.label}>
      <Button
        variant="ghost"
        size="sm"
        icon={<IconTrashOutline16 size={16} />}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={props.onClick}
      />
    </Tooltip>
  )
}

/** Collapsible section component */
export function CollapsibleSection(props: {
  title: string
  defaultExpanded?: boolean
  children: ReactNode
}): ReactNode {
  const [expanded, setExpanded] = useState(props.defaultExpanded ?? true)

  return (
    <div style={S.collapsible}>
      <div style={S.collapseHeader} onClick={() => setExpanded(!expanded)}>
        <span style={{ ...S.collapseArrow, ...(expanded ? S.collapseArrowExpanded : {}) }}>▶</span>
        <span style={S.collapseTitle}>{props.title}</span>
      </div>
      {expanded && <div style={S.collapseContent}>{props.children}</div>}
    </div>
  )
}

/** Compact A3 gauge: stacked per-channel color bar + token/share reading. */
export function BudgetGauge(props: { t: Translate; report: BudgetReport }): ReactNode {
  const { t, report } = props
  const totalChars = report.sections.reduce((sum, section) => sum + section.chars, 0)
  const segmentColor: Record<BudgetSection['id'], string> = {
    card: 'var(--dsw-alias-brand-primary)',
    summary: 'var(--dsw-alias-label-secondary)',
    state: 'var(--dsw-alias-label-tertiary)',
    triggers: 'var(--dsw-alias-label-danger)',
  }
  const textColor =
    report.level === 'danger'
      ? 'var(--dsw-alias-status-error)'
      : report.level === 'warn'
        ? 'var(--dsw-alias-label-danger)'
        : 'var(--dsw-alias-label-secondary)'
  return (
    <div style={S.budget}>
      <div style={S.budgetHead}>
        <span style={S.budgetTitle}>{t('budget.title')}</span>
        <span style={{ ...S.budgetText, color: textColor }}>
          {'≈ ' + report.totalTokens.toLocaleString() + ' tokens · ' + report.pct + '%'}
        </span>
      </div>
      <Tooltip label={t('budget.hint')}>
        <div style={S.budgetBar}>
          {report.sections.map((section) => (
            <div
              key={section.id}
              title={t('budget.' + section.id)}
              style={{
                width: totalChars > 0 ? String((section.chars / totalChars) * 100) + '%' : '0%',
                background: segmentColor[section.id],
              }}
            />
          ))}
        </div>
      </Tooltip>
    </div>
  )
}
