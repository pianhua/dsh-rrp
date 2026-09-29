/**
 * Test-only stand-in for `@deepseek-ai/dsh-client-ui-primitives`.
 *
 * The atoms are a browser platform module the host seeds at runtime; Node (and
 * therefore vitest) cannot resolve the bare specifier. vitest.config.ts aliases
 * it here. The stubs render semantic tags so `renderToStaticMarkup` in
 * tests/client-render.spec.ts can see real text, values and disabled states —
 * a null component would silently swallow every assertion about what a panel
 * shows.
 */
import { createElement, type ReactNode } from 'react'

type Props = Record<string, unknown> & { children?: ReactNode }

/** Render `tag`, dropping the props the DOM would reject. */
function atom(tag: string, keep: readonly string[]) {
  return function Atom(props: Props): ReactNode {
    const attributes: Record<string, unknown> = {}
    for (const key of keep) {
      if (props[key] !== undefined) attributes[key] = props[key]
    }
    return createElement(tag, attributes, props.children)
  }
}

export const Button = atom('button', ['disabled', 'title', 'aria-label', 'type', 'onClick'])
export const Pill = atom('span', ['title', 'aria-label'])
export const Input = atom('input', [
  'value',
  'placeholder',
  'disabled',
  'type',
  'aria-label',
  'onChange',
])
export const StateDot = atom('span', ['title', 'aria-label'])
export const DisclosureRow = atom('details', ['title', 'aria-label'])
export const Tooltip = atom('span', ['title', 'aria-label'])

/** Modal-like confirmation for risky writes; renders visibly only when open. */
export function RiskConfirmation(props: {
  open: boolean
  title: string
  description: string
  children?: ReactNode
}): ReactNode {
  if (!props.open) return null
  return createElement(
    'div',
    { 'data-risk-confirmation': '' },
    props.title,
    props.description,
    props.children,
  )
}

/** Icons carry no text; the tag name is enough to assert a control is present. */
function icon(name: string) {
  return function Icon(): ReactNode {
    return createElement('i', { 'data-icon': name })
  }
}

export const IconArchiveOutlineMedium = icon('IconArchiveOutlineMedium')
export const IconChevronDownOutlineRegular = icon('IconChevronDownOutlineRegular')
export const IconCheckOutlineRegular = icon('IconCheckOutlineRegular')
export const IconEditOutlineRegular = icon('IconEditOutlineRegular')
export const IconLoadingOutlineRegular = icon('IconLoadingOutlineRegular')
export const IconPlayOutlineRegular = icon('IconPlayOutlineRegular')
export const IconPlusOutlineRegular = icon('IconPlusOutlineRegular')
export const IconRefreshOutlineRegular = icon('IconRefreshOutlineRegular')
export const IconSearchOutlineRegular = icon('IconSearchOutlineRegular')
export const IconSkillOutlineRegular = icon('IconSkillOutlineRegular')
export const IconSparkleRegular = icon('IconSparkleRegular')
export const IconTrashOutlineRegular = icon('IconTrashOutlineRegular')
export const IconUserOutlineRegular = icon('IconUserOutlineRegular')
export const IconWarningOutlineRegular = icon('IconWarningOutlineRegular')
