/**
 * dsh-rrp — card-declared UI vocabulary (issue #18, L1).
 *
 * A card may ship `ui/manifest.json` describing panels the Stage tab renders
 * from the live WorldState. Mechanism lives on the host (parsing, validation,
 * condition evaluation, path serving); the card author writes declarative data
 * only, against a CLOSED component set — anything richer is a card HTML app
 * (L2), never a bigger schema.
 *
 * The host route and client panel share this one module. Card UI never enters the model
 * context — it is player-facing presentation, not a world fact.
 */
import {
  evalCondition,
  parseWhenPath,
  resolveWhenPath,
  type WhenCondition,
} from './lore-condition.ts'
import { applyWorldStatePatch } from './world-state-references.ts'
import type { ObjectReference, TrackedObject, WorldState } from './world-state.ts'

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
   * `gauge` → a v2 number path;
   * `characterCard` → a tracked object id (omit = every character);
   * `timeline` → an optional scene tracked object id;
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

/** The characters a `characterCard` panel shows (one by object id, or all). */
export function readCharacters(
  bind: string | undefined,
  state: WorldState,
): Array<{ name: string; state: TrackedObject }> {
  const objects = Object.values(state.trackedObjects)
    .filter((object) => object.kind === 'character')
    .sort((a, b) => a.id.localeCompare(b.id))
  if (bind === undefined || bind.length === 0) {
    return objects.map((object) => ({ name: object.name, state: object }))
  }
  const objectId = bind.startsWith('trackedObjects.') ? bind.split('.')[1] : bind
  const object = objectId === undefined ? undefined : state.trackedObjects[objectId]
  return object?.kind === 'character' ? [{ name: object.name, state: object }] : []
}

/** Scene tracked objects and their scalar field values for a timeline panel. */
export function readTimeline(
  bind: string | undefined,
  state: WorldState,
): Array<{ name: string; fields: Record<string, unknown> }> {
  const objectId = bind?.startsWith('trackedObjects.') ? bind.split('.')[1] : bind
  return Object.values(state.trackedObjects)
    .filter(
      (object) => object.kind === 'scene' && (objectId === undefined || object.id === objectId),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((object) => ({
      name: object.name,
      fields: Object.fromEntries(
        Object.entries(object.fields)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([fieldId, field]) => [fieldId, field.value]),
      ),
    }))
}

/** Resolve a relation endpoint to a player-safe display name. */
export function readReferenceName(reference: ObjectReference, state: WorldState): string {
  if (reference.objectId !== undefined) {
    return state.trackedObjects[reference.objectId]?.name ?? '不公开对象'
  }
  return reference.external?.name ?? '不公开对象'
}

/** Apply a v2 button patch through the same safe write semantics as correction. */
export function applyButtonPatch(state: WorldState, patch: Record<string, unknown>): WorldState {
  const result = applyWorldStatePatch(state, patch)
  return result.ok ? result.state : state
}
