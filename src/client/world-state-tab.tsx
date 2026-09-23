/**
 * dsh-rrp — the WorldState right-sidebar tab.
 *
 * Registers through the native right-sidebar path (ctx.sidebarRightTabs +
 * the keyed sidebar.right.pane.tab seat) and presents a structured, inline
 * editor: one card per character/item, one row per flag, three scene fields.
 * The player corrects the state in place (D6, no locks); saving posts the
 * whole edited state to the host route, and the panel re-reads the
 * authoritative projection.
 *
 * The chrome is built from the host's own atoms
 * (`@deepseek-ai/dsh-client-ui-primitives`) and `--dsw-alias-*` tokens so it
 * matches whatever light/dark theme the user runs.
 */
import {
  Button,
  IconLoadingOutline16,
  Pill,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { pendingActivity, type RrpActivityLog } from '../activity.ts'
import { CARD_KEY, type CardContext } from '../card-types.ts'
import { SUMMARY_KEY, type MacroSummary } from '../macro-summary.ts'
import { promptBudgetReport } from '../prompt-budget.ts'
import { RRP_ROUTES, routeUrl, type LoreGetResponse } from '../route-contract.ts'
import { WORLD_STATE_KEY, type WorldStateView } from '../world-state.ts'
import {
  draftOf,
  isEmptyDraft,
  stateOfDraft,
  type WorldStateDraft as Draft,
} from './world-state-draft.ts'
import type { RrpClientContext, RrpJobView, RrpUseSessions } from './context-types.ts'
import { DynamicFieldsSection } from './components/world-state-dynamic.tsx'
import {
  BudgetGauge,
  clockOf,
  CollapsibleSection,
  S,
  type Translate,
} from './components/world-state-primitives.tsx'
import {
  CharactersSection,
  FlagsSection,
  InventorySection,
  RelationsSection,
  SceneSection,
} from './components/world-state-sections.tsx'

/** Implementation identity; also the key the body registers under. */
const TAB_ID = 'dsh-rrp/world-state'
/** Type discriminator openTab names. */
const TAB_KIND = 'dsh-rrp-worldstate'

/** Paths come from the shared route contract (#22). */
const CORRECTION_PATH = RRP_ROUTES.worldState
const ACTIVITY_PATH = RRP_ROUTES.activity
const LORE_PATH = RRP_ROUTES.lore
/** Fallback poll interval, used only when the host jobs mirror is unavailable. */
const ACTIVITY_POLL_MS = 2000

/** Props the slot framework merges: our inject face plus session standards. */
interface WorldStatePanelProps {
  t?: Translate
  useProjection?: (key: string) => unknown
  useSessions?: RrpUseSessions
  sessionId?: string
}

type RowListName = 'characters' | 'inventory' | 'flags'

function WorldStatePanel(props: WorldStatePanelProps): ReactNode {
  const t: Translate = typeof props.t === 'function' ? props.t : (key) => key
  const view =
    typeof props.useProjection === 'function'
      ? (props.useProjection(WORLD_STATE_KEY) as WorldStateView | undefined)
      : undefined
  const sessionPreset =
    typeof props.useProjection === 'function'
      ? (props.useProjection('agentPreset') as string | undefined)
      : undefined
  const cardContext =
    typeof props.useProjection === 'function'
      ? (props.useProjection(CARD_KEY) as CardContext | null | undefined)
      : undefined
  const macroSummary =
    typeof props.useProjection === 'function'
      ? (props.useProjection(SUMMARY_KEY) as MacroSummary | undefined)
      : undefined
  const [injectedChars, setInjectedChars] = useState<number | undefined>(undefined)
  const budgetReport = promptBudgetReport({
    card: cardContext ?? null,
    summary: macroSummary ?? undefined,
    state: view,
    injectedChars,
  })
  const showBudget = cardContext != null || macroSummary != null || view != null
  const sessionId = props.sessionId
  const chroniclerJobs =
    typeof props.useSessions === 'function' && sessionId !== undefined
      ? (props.useSessions((state) => state.jobsBySession[sessionId]) as
          readonly RrpJobView[] | undefined)
      : undefined
  const jobsInferring =
    chroniclerJobs === undefined
      ? undefined
      : chroniclerJobs.some(
          (job) =>
            job.kind === 'chronicler' && (job.status === 'running' || job.status === 'stopping'),
        )
  const [activity, setActivity] = useState<RrpActivityLog | undefined>(undefined)
  const recentActivity = (activity?.entries ?? []).slice(-4).reverse()
  const ledgerInferring =
    activity === undefined ? undefined : pendingActivity(activity, 'world-state') !== undefined
  const isInferring = jobsInferring ?? ledgerInferring ?? false

  const [draft, setDraft] = useState<Draft>(() => draftOf(view))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  const rowKeySeq = useRef(0)
  const nextRowKey = (): string => {
    rowKeySeq.current += 1
    return 'row-' + String(rowKeySeq.current)
  }
  const fitRowKeys = (keys: readonly string[], length: number): string[] => {
    if (keys.length === length) return [...keys]
    if (keys.length > length) return keys.slice(0, length)
    return [...keys, ...Array.from({ length: length - keys.length }, nextRowKey)]
  }
  const [rowKeys, setRowKeys] = useState<Record<RowListName, string[]>>(() => {
    const initial = draftOf(view)
    return {
      characters: fitRowKeys([], initial.characters.length),
      inventory: fitRowKeys([], initial.inventory.length),
      flags: fitRowKeys([], initial.flags.length),
    }
  })
  const adoptDraft = (next: Draft): void => {
    setDraft(next)
    setRowKeys((previous) => ({
      characters: fitRowKeys(previous.characters, next.characters.length),
      inventory: fitRowKeys(previous.inventory, next.inventory.length),
      flags: fitRowKeys(previous.flags, next.flags.length),
    }))
  }
  const addRowKey = (list: RowListName): void => {
    if (isInferring) return
    setRowKeys((previous) => ({ ...previous, [list]: [...previous[list], nextRowKey()] }))
  }
  const removeRowKey = (list: RowListName, index: number): void => {
    if (isInferring) return
    setRowKeys((previous) => ({
      ...previous,
      [list]: previous[list].filter((_, at) => at !== index),
    }))
  }

  useEffect(() => {
    if (!dirty) adoptDraft(draftOf(view))
  }, [view, dirty])

  const [wasInferring, setWasInferring] = useState(false)
  useEffect(() => {
    if (isInferring) {
      setWasInferring(true)
    } else if (wasInferring) {
      setWasInferring(false)
      if (dirty) {
        setStatus(t('chronicler.completed') + ' · ' + t('unsaved.kept'))
      } else {
        adoptDraft(draftOf(view))
        setStatus(t('chronicler.completed'))
      }
    }
  }, [isInferring, wasInferring, view, t, dirty])

  const loadActivity = (): void => {
    if (sessionId === undefined) return
    void fetch(routeUrl(ACTIVITY_PATH, sessionId))
      .then((response) => (response.ok ? (response.json() as Promise<RrpActivityLog>) : undefined))
      .then((log) => {
        if (log !== undefined) setActivity(log)
      })
      .catch(() => {
        /* best effort */
      })
    void fetch(routeUrl(LORE_PATH, sessionId))
      .then((response) =>
        response.ok
          ? (response.json() as Promise<Pick<LoreGetResponse, 'injectedChars'>>)
          : undefined,
      )
      .then((body) => {
        if (body !== undefined && typeof body.injectedChars === 'number')
          setInjectedChars(body.injectedChars)
      })
      .catch(() => {
        /* best effort */
      })
  }
  useEffect(() => {
    if (sessionId === undefined) {
      setActivity(undefined)
      return
    }
    loadActivity()
    if (typeof props.useSessions === 'function') return
    const timer = setInterval(loadActivity, ACTIVITY_POLL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [sessionId, props.useSessions])

  const wasJobsInferring = useRef(false)
  useEffect(() => {
    if (jobsInferring === true) {
      wasJobsInferring.current = true
      return
    }
    if (wasJobsInferring.current) {
      wasJobsInferring.current = false
      loadActivity()
    }
  }, [jobsInferring])

  const mutate = (change: (next: Draft) => void): void => {
    if (isInferring) return
    setDraft((previous) => {
      const next = structuredClone(previous)
      change(next)
      return next
    })
    setDirty(true)
    setStatus('')
  }

  const save = (): void => {
    if (sessionId === undefined) {
      setStatus(t('noSession'))
      return
    }
    setSaving(true)
    setStatus(t('saving'))
    void fetch(CORRECTION_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, state: stateOfDraft(draft) }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.text()) || String(response.status))
        setDirty(false)
        setStatus(t('saved'))
      })
      .catch((error: unknown) => {
        setStatus(
          t('saveFailed') + ': ' + String((error as { message?: string })?.message ?? error),
        )
      })
      .finally(() => setSaving(false))
  }

  return (
    <div className="dsh-rrp-world" style={S.root}>
      <div style={S.header}>
        <span style={S.title}>{t('title')}</span>
        {sessionPreset !== undefined && sessionPreset.length > 0 ? (
          <Tooltip label={t('preset.hint')}>
            <span style={S.presetTag}>{sessionPreset}</span>
          </Tooltip>
        ) : null}
        <span style={S.spacer} />
        {dirty ? <Pill active>{t('unsaved')}</Pill> : null}
      </div>

      <div style={S.scroll}>
        {showBudget ? <BudgetGauge t={t} report={budgetReport} /> : null}
        <p style={S.hint}>{t('editHint')}</p>

        {isEmptyDraft(draft) ? <div style={S.empty}>{t('world.missing')}</div> : null}

        <div style={S.activity}>
          <div style={S.activityHead}>{t('activity.title')}</div>
          {isInferring ? (
            <div style={S.running}>
              <StateDot state="ongoing" />
              <span>{t('activity.running')}</span>
            </div>
          ) : null}
          {recentActivity.length === 0 ? (
            <div style={S.activityEmpty}>{t('activity.none')}</div>
          ) : null}
          {recentActivity.map((entry, index) => (
            <div key={entry.id + ':' + entry.phase + ':' + index} style={S.activityRow}>
              <span style={S.activityWho}>{t('actor.' + entry.actor)}</span>
              <span style={S.activityWhat}>
                {t('phase.' + entry.phase)}
                {entry.detailKey !== undefined
                  ? ' · ' + t(entry.detailKey).replaceAll('{name}', entry.detailName ?? '')
                  : entry.detail !== undefined && entry.detail.length > 0
                    ? ' · ' + entry.detail
                    : ''}
              </span>
              <span style={S.activityWhen}>{clockOf(entry.at)}</span>
            </div>
          ))}
        </div>

        <CollapsibleSection title={t('section.coreState')} defaultExpanded={true}>
          <div style={S.section}>
            <span style={S.sectionTitle}>{t('section.scene')}</span>
          </div>
          <SceneSection
            t={t}
            scene={draft.scene}
            disabled={isInferring}
            onChange={(field, v) =>
              mutate((d) => {
                d.scene[field] = v
              })
            }
          />

          <CharactersSection
            t={t}
            characters={draft.characters}
            rowKeys={rowKeys.characters}
            disabled={isInferring}
            onAdd={() => {
              mutate((d) => {
                d.characters.push({
                  name: '',
                  affinity: '',
                  mood: '',
                  appearance: '',
                  condition: '',
                })
              })
              addRowKey('characters')
            }}
            onRemove={(index) => {
              mutate((d) => {
                d.characters.splice(index, 1)
              })
              removeRowKey('characters', index)
            }}
            onUpdate={(index, field, value) => {
              mutate((d) => {
                d.characters[index][field] = value
              })
            }}
          />

          <RelationsSection t={t} relations={draft.relations} />

          <InventorySection
            t={t}
            inventory={draft.inventory}
            rowKeys={rowKeys.inventory}
            disabled={isInferring}
            onAdd={() => {
              mutate((d) => {
                d.inventory.push({ name: '', quantity: '', note: '' })
              })
              addRowKey('inventory')
            }}
            onRemove={(index) => {
              mutate((d) => {
                d.inventory.splice(index, 1)
              })
              removeRowKey('inventory', index)
            }}
            onUpdate={(index, field, value) => {
              mutate((d) => {
                d.inventory[index][field] = value
              })
            }}
          />

          <FlagsSection
            t={t}
            flags={draft.flags}
            rowKeys={rowKeys.flags}
            disabled={isInferring}
            onAdd={() => {
              mutate((d) => {
                d.flags.push({ key: '', value: '' })
              })
              addRowKey('flags')
            }}
            onRemove={(index) => {
              mutate((d) => {
                d.flags.splice(index, 1)
              })
              removeRowKey('flags', index)
            }}
            onUpdate={(index, field, value) => {
              mutate((d) => {
                d.flags[index][field] = value
              })
            }}
          />
        </CollapsibleSection>

        <DynamicFieldsSection
          t={t}
          fields={draft.dynamicFields}
          isInferring={isInferring}
          onAdd={(newField) => {
            mutate((d) => {
              d.dynamicFields.push(newField)
            })
          }}
          onUpdate={(index, updated) => {
            mutate((d) => {
              d.dynamicFields[index] = updated
            })
          }}
          onDelete={(index) => {
            mutate((d) => {
              d.dynamicFields.splice(index, 1)
            })
          }}
        />
      </div>

      <div style={S.footer}>
        <span style={S.status}>{isInferring ? t('chronicler.running') : status}</span>
        <Button
          variant="primary"
          icon={saving ? <IconLoadingOutline16 size={16} /> : undefined}
          disabled={sessionId === undefined || saving || isInferring}
          onClick={save}
        >
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  )
}

/** Register the tab type and its body; both dispose with this fiber. */
export function registerWorldStateTab(ctx: RrpClientContext): void {
  const t = ctx.locale.bind('rrp') as Translate
  ctx.effect(() => {
    const disposeType = ctx.sidebarRightTabs.register({
      id: TAB_ID,
      kind: TAB_KIND,
      title: () => t('title'),
      guide: [{ order: 50, title: () => t('title'), description: () => t('guide.description') }],
    })
    const disposeBody = ctx.slots.register(
      {
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        locale: 'rrp',
        inject: (sessionId: unknown) => ({ t, sessionId }),
      },
      WorldStatePanel,
    )
    return () => {
      disposeBody()
      disposeType()
    }
  }, 'dsh-rrp: WorldState tab')
}
