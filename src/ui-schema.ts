/**
 * dsh-rrp — card-declared UI vocabulary (issue #18, L1).
 *
 * A card may ship `ui/manifest.json` describing panels the Stage tab renders
 * from the live WorldState. Mechanism lives on the host (parsing, validation,
 * condition evaluation, path serving); the card author writes declarative data
 * only, against a CLOSED component set — anything richer is a card HTML app
 * (L2), never a bigger schema.
 *
 * Dependency-free like world-state.ts / lore-condition.ts: the host route and
 * the client panel share this one module. Card UI never enters the model
 * context — it is player-facing presentation, not a world fact.
 */
import {
  evalCondition,
  parseWhenPath,
  resolveWhenPath,
  type WhenCondition,
} from './lore-condition.ts'
import type { WorldState } from './world-state.ts'

/** The closed interpreter set: five declarative panels, or one card-authored page. */
export type UiComponentKind =
  'gauge' | 'characterCard' | 'relationTable' | 'timeline' | 'buttonRow' | 'app'

/**
 * The only two things card UI may ever do. Every button resolves to one of
 * these, so a card can never open a third write path around the control loop.
 */
export type UiActionKind = 'correct_state' | 'ask_copilot'

export const UI_COMPONENT_KINDS: readonly UiComponentKind[] = [
  'gauge',
  'characterCard',
  'relationTable',
  'timeline',
  'buttonRow',
  'app',
]

/** The closed action set, as a list so the manifest validator cannot drift. */
export const UI_ACTION_KINDS: readonly UiActionKind[] = ['correct_state', 'ask_copilot']

/** One buttonRow entry. */
export interface UiButtonDecl {
  label: string
  action: UiActionKind
  /** `correct_state`: a WorldState patch, merged with player-correction semantics. */
  patch?: Record<string, unknown>
  /** `ask_copilot`: text pre-filled into the copilot input (never auto-sent). */
  question?: string
}

/** One panel as the host hands it to the client (`when` already parsed). */
export interface UiPanelDecl {
  id: string
  component: UiComponentKind
  title?: string
  /**
   * What the panel binds to, per component:
   * `gauge` → a number path (`characters.<名>.affinity` / `inventory.<名>.quantity`
   * / `flags.<名>` / `scene.<字段>` / a dynamic field's top-level key);
   * `characterCard` → one character name (omit = every character);
   * the rest → unused.
   */
  bind?: string
  /** `gauge` bounds; a dynamic field's own min/max win when present. */
  min?: number
  max?: number
  /** Visibility condition — same syntax as a skill's `when:`. */
  when?: WhenCondition
  /** `buttonRow` only. */
  buttons?: UiButtonDecl[]
  /** `app` only: the card's own page under its `ui/` directory. */
  src?: string
  order?: number
  /** Grid width in columns (stack layout ignores it). */
  span?: 1 | 2
}

/** A card's whole UI declaration. */
export interface UiManifest {
  version: 1
  title?: string
  layout: 'stack' | 'grid'
  panels: UiPanelDecl[]
}

/** Panels per card, capped: a HUD is a glance, not a second product. */
export const UI_PANEL_LIMIT = 12
/** Buttons per buttonRow. */
export const UI_BUTTON_LIMIT = 8

/**
 * The panels a player should actually see right now, in render order.
 * Pure and shared: the host uses it for previews, the client for live renders,
 * so a panel can never appear in one place and hide in the other.
 */
export function visiblePanels(
  manifest: UiManifest | null | undefined,
  state: WorldState | null,
): UiPanelDecl[] {
  if (manifest === null || manifest === undefined) return []
  return manifest.panels
    .filter(
      (panel) => panel.when === undefined || (state !== null && evalCondition(panel.when, state)),
    )
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))
}

/**
 * Resolve a `gauge` bind to a number.
 * @returns the value, or undefined when the path is absent or not a number.
 */
export function readGaugeValue(bind: string | undefined, state: WorldState): number | undefined {
  if (bind === undefined || bind.length === 0) return undefined
  const path = parseWhenPath(bind)
  if (path instanceof Error) return undefined
  const raw = resolveWhenPath(path, state)
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

/** The characters a `characterCard` panel shows (one by bind, or all). */
export function readCharacters(
  bind: string | undefined,
  state: WorldState,
): Array<{ name: string; state: unknown }> {
  const characters = state.characters as Record<string, unknown> | undefined
  if (characters === undefined || characters === null) return []
  if (bind !== undefined && bind.length > 0) {
    const one = characters[bind]
    return one === undefined ? [] : [{ name: bind, state: one }]
  }
  return Object.keys(characters)
    .sort()
    .map((name) => ({ name, state: characters[name] }))
}

/**
 * Merge one button's patch into the live state.
 *
 * The correction route takes a whole slice, so a button writes intent and the
 * merge happens here — same shape the copilot patch uses: `characters` and
 * `inventory` merge by name (only the named sub-fields change), everything else
 * is a whole-domain replace, and `null` deletes a key.
 */
export function applyButtonPatch(state: WorldState, patch: Record<string, unknown>): WorldState {
  const next: Record<string, unknown> = { ...state }
  for (const [key, value] of Object.entries(patch)) {
    const current = next[key]
    if (key === 'characters' || key === 'inventory') {
      if (typeof value !== 'object' || value === null) {
        next[key] = value
        continue
      }
      const merged: Record<string, unknown> = {
        ...(typeof current === 'object' && current !== null ? current : {}),
      }
      for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
        if (entry === null) delete merged[name]
        else
          merged[name] =
            typeof entry === 'object'
              ? { ...(merged[name] as object | undefined), ...(entry as object) }
              : entry
      }
      next[key] = merged
      continue
    }
    if (value === null) delete next[key]
    else next[key] = value
  }
  return next as WorldState
}
