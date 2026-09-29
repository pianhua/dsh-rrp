/**
 * Structural face of the DSH client UI atoms this plugin consumes.
 *
 * \`@deepseek-ai/dsh-client-ui-primitives\` is a PLATFORM module the web shell
 * seeds into its frozen module table (see tsdown.config.ts CLIENT_EXTERNALS), so
 * it is deliberately NOT an installed dependency: the runtime resolves it, the
 * build keeps it external, and only typecheck needs a declaration. This mirrors
 * the local-structural-face pattern in ./context-types.ts.
 *
 * Only the atoms this plugin imports are declared; the shape is taken from the
 * host's ui-primitives source (Button/Pill/Input/StateDot/DisclosureRow/Tooltip)
 * and the runtime export list of the installed web bundle.
 */
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode } from 'react'

  /** Shared props for every \`ic_ds_*\` icon component. */
  export interface IconProps {
    /** Square edge in px; defaults to the glyph's own drawn size. */
    size?: number
    /** Extra class for layout placement; color rides currentColor. */
    className?: string
  }

  /** Localized chrome for one Markdown code fence. */
  export interface MarkdownCodeLabels {
    copyLabel: string
    copiedLabel: string
  }

  /** Localized chrome for a Markdown document (footnotes heading is sr-only). */
  export interface MarkdownLabels {
    code: MarkdownCodeLabels
    footnotes: string
  }

  /** Untrusted assistant-Markdown renderer over the host mdast pipeline. */
  export function MarkdownText(props: {
    text: string
    /** Parse incrementally across chunks (per-chunk work tracks the tail). */
    streaming?: boolean
    /** Reference-stable labels; a new identity discards the render cache. */
    labels: MarkdownLabels
    fileMentions?: unknown
    pathImages?: unknown
    variant?: 'body' | 'compact'
  }): ReactElement

  /** One rendered SVG icon. */
  export type IconComponent = (props: IconProps) => ReactElement

  /** Visual family of a Button, each backed by --dsw-alias-button-*. */
  export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'

  /** Token-styled capsule button atom. */
  export function Button(
    props: {
      variant?: ButtonVariant
      size?: 'md' | 'sm'
      icon?: ReactNode
      className?: string
      children?: ReactNode
    } & ButtonHTMLAttributes<HTMLButtonElement>,
  ): ReactElement

  /** Small rounded label chip; interactive when onClick is supplied. */
  export function Pill(
    props: {
      active?: boolean
      className?: string
      children?: ReactNode
    } & ButtonHTMLAttributes<HTMLButtonElement>,
  ): ReactElement

  /** Single-line text input with an optional leading icon. */
  export function Input(
    props: {
      icon?: ReactNode
      className?: string
    } & InputHTMLAttributes<HTMLInputElement>,
  ): ReactElement

  /** Four-color state indicator (done / warning / ongoing / error). */
  export function StateDot(props: {
    state: 'done' | 'warning' | 'ongoing' | 'error'
    size?: number
    className?: string
  }): ReactElement

  /** Controlled disclosure header plus its expanded content. */
  export function DisclosureRow(props: {
    icon: ReactNode
    title: string
    open: boolean
    expandable: boolean
    onToggle: () => void
    expandOnRowClick?: boolean
    collapsedContent?: ReactNode
    children?: ReactNode
    className?: string
    rowClassName?: string
    titleClassName?: string
  }): ReactElement

  /** Hover/focus label bubble attached to one anchor element. */
  export function Tooltip(props: {
    label: string | (() => string)
    side?: 'right' | 'bottom' | 'top'
    delayMs?: number
    disabled?: boolean
    maxWidth?: number
    children: ReactElement
  }): ReactElement

  /** Controlled acknowledgement dialog for risky writes. */
  export function RiskConfirmation(props: {
    open: boolean
    title: string
    description: string
    acknowledgeLabel: string
    cancelLabel: string
    closeLabel: string
    confirmLabel: string
    acknowledged: boolean
    disabled?: boolean
    onAcknowledgedChange: (acknowledged: boolean) => void
    onCancel: () => void
    onConfirm: () => void
  }): ReactElement

  export const IconArchiveOutlineMedium: IconComponent
  export const IconChevronDownOutlineRegular: IconComponent
  export const IconCheckOutlineRegular: IconComponent
  export const IconEditOutlineRegular: IconComponent
  export const IconLoadingOutlineRegular: IconComponent
  export const IconPlayOutlineRegular: IconComponent
  export const IconPlusOutlineRegular: IconComponent
  export const IconRefreshOutlineRegular: IconComponent
  export const IconSearchOutlineRegular: IconComponent
  export const IconSkillOutlineRegular: IconComponent
  export const IconSparkleRegular: IconComponent
  export const IconTrashOutlineRegular: IconComponent
  export const IconUserOutlineRegular: IconComponent
  export const IconWarningOutlineRegular: IconComponent
}
