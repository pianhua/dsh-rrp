/**
 * Structural face of the client Cordis Context this plugin consumes.
 *
 * Service members are restated locally and combined with the vendored cordis
 * Context by INTERSECTION rather than module augmentation: DSH's own host and
 * client packages declare different types for the same member, so a
 * `declare module` re-declaration here would fail interface merging (TS2717).
 * This is the community pattern (see dsh-better-sidebar/src/context-types.ts).
 */
import type { Context as CordisContext } from '@deepseek-ai/cordis'

/** Options `ctx.slots.register` accepts (the subset this plugin uses). */
export interface RrpSlotRegisterOptions {
  name: string
  key?: string
  id?: string
  order?: number
  label?: string | (() => string)
  locale?: string
  inject?: (...args: unknown[]) => Record<string, unknown>
}

/** The client slot registry face (register/inject), a mirror of the runtime. */
export interface RrpSlotsService {
  /** Register one component for a declared slot; returns the disposer. */
  register(options: RrpSlotRegisterOptions, component: unknown): () => void
  /** Run a callback for each declaration lifetime of a slot (no-op while undeclared). */
  inject(key: string, callback: () => () => void): () => void
}

/** One entry capsule the guide page offers. */
export interface RrpGuideEntry {
  order: number
  title: () => string
  description?: () => string
}

/** Stage one of a right-sidebar tab type registration. */
export interface RrpSidebarRightTabDefinition {
  id: string
  kind: string
  title: (address: string) => string
  guide?: readonly RrpGuideEntry[]
}

/** The right-sidebar tab-type registry. */
export interface RrpSidebarRightTabsService {
  register(definition: RrpSidebarRightTabDefinition): () => void
}

/** The client locale registry slice this plugin uses. */
export interface RrpLocaleService {
  /** Per-locale dictionary registration (untyped external namespace form). */
  register(ns: string, locale: string, dict: Record<string, string>): () => void
  /** Bind one namespace to a live translate function. */
  bind(ns: string): (key: string) => string
}

/** One session's behavior face (subset of the client session contract). */
export interface RrpSessionBindingFace {
  session: {
    /** Send a user prompt; 'queue' appends a turn. */
    prompt(
      content: Array<{ type: 'text'; text: string }>,
      mode: 'queue' | 'steer',
    ): Promise<unknown>
    /** Rename the session (the card name becomes the title). */
    rename?(title: string): Promise<unknown>
  }
}

/** One listed session row (the fields the worldline map reads). */
export interface RrpSessionSummary {
  displayTitle?: string
  /** The durable user title (set by rename); displayTitle falls back to cwd. */
  title?: string
  parentId?: string
  cardId?: string
  cardName?: string
  updatedAt?: string | number
  blank?: boolean
}

/** Observable session-list snapshot (host SessionListState slice). */
export interface RrpSessionListStore {
  getSnapshot(): { ids: string[]; byId: Record<string, RrpSessionSummary> }
  subscribe(listener: () => void): () => void
}

/** Client sessions service face (subset of dsh-api-session-controller). */
export interface RrpSessionsService {
  /** Create a session on the host; the new session is addressable on resolve. */
  create(options?: { workspaceId?: string; cwd?: string }): Promise<string>
  /** Resolve the behavior face of a listed session. */
  binding(id: string): RrpSessionBindingFace | undefined
  /** Host session roster with fork lineage (issue #28 reads parentId/displayTitle). */
  readonly list?: RrpSessionListStore
  /** Fork a child session through an event seq; returns the child id. */
  fork?(opts: { sessionId: string; atSeq?: number; increaseTitle?: boolean }): Promise<string>
}

/** Remote RPC face (subset of dsh-api-remotes). */
export interface RrpRemoteService {
  /** Host-side preset roster commands. */
  agentPresets: {
    select(
      sessionId: string,
      presetId: string,
    ): Promise<{ ok: boolean; error?: { message?: string } }>
  }
}

/** Layout viewing-state face (subset of dsh-client-ui-layout). */
export interface RrpLayoutService {
  /** Select a registered main panel, or null to return to the conversation. */
  selectPanel(panelId: string | null): void
}

/** One job row mirrored to the client by the host Session Controller (`jobs` frames). */
export interface RrpJobView {
  id: string
  kind: string
  label: string
  status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed'
  detail?: string
  startedAt: number
  finishedAt?: number
}

/** The slice of the host session-list state this plugin consumes. */
export interface RrpSessionListState {
  jobsBySession: Readonly<Record<string, readonly RrpJobView[]>>
}

/**
 * The host's pushed session-list mirror (`useSessions`): subscribe with a
 * selector; the component re-renders only when the selected slice changes.
 * Push-fed by the host — no polling behind it.
 */
export type RrpUseSessions = <T>(selector: (state: RrpSessionListState) => T) => T

/** The host's pushed per-session projection hook (`useProjection`). */
export type RrpUseProjection = (key: string) => unknown

/** Workspace UI capability (subset of dsh-client-ui-workspace). */
export interface RrpUiWorkspaceService {
  /** Select a Session and show its Conversation as one UI navigation action. */
  openSession(target: string): void
  startSession?(workspaceId?: string): void
  forkSession?(sessionId: string): Promise<void>
}

/** The Context the client half sees. */
export type RrpClientContext = CordisContext & {
  slots: RrpSlotsService
  sidebarRightTabs: RrpSidebarRightTabsService
  locale: RrpLocaleService
  /** Present whenever the session controller is loaded. */
  sessions?: RrpSessionsService
  /** Present whenever the remote RPC layer is loaded. */
  remote?: RrpRemoteService
  /** Present whenever the layout shell is loaded. */
  layout?: RrpLayoutService
  /** Present whenever the workspace navigation shell is loaded. */
  uiWorkspace?: RrpUiWorkspaceService
}
