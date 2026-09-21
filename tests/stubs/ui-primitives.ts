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

export const Button = atom('button', ['disabled', 'title', 'aria-label', 'type'])
export const Pill = atom('span', ['title', 'aria-label'])
export const Input = atom('input', ['value', 'placeholder', 'disabled', 'type', 'aria-label'])
export const StateDot = atom('span', ['title', 'aria-label'])
export const DisclosureRow = atom('details', ['title', 'aria-label'])
export const Tooltip = atom('span', ['title', 'aria-label'])

/** Icons carry no text; the tag name is enough to assert a control is present. */
function icon(name: string) {
  return function Icon(): ReactNode {
    return createElement('i', { 'data-icon': name })
  }
}

export const IconArchiveOutline20 = icon('IconArchiveOutline20')
export const IconChevronDownOutline14 = icon('IconChevronDownOutline14')
export const IconCheckOutline16 = icon('IconCheckOutline16')
export const IconEditOutline16 = icon('IconEditOutline16')
export const IconLoadingOutline16 = icon('IconLoadingOutline16')
export const IconPlayOutline16 = icon('IconPlayOutline16')
export const IconPlusOutline16 = icon('IconPlusOutline16')
export const IconRefreshOutline16 = icon('IconRefreshOutline16')
export const IconSearchOutline16 = icon('IconSearchOutline16')
export const IconSkillOutline16 = icon('IconSkillOutline16')
export const IconSparkle16 = icon('IconSparkle16')
export const IconTrashOutline16 = icon('IconTrashOutline16')
export const IconUserOutline16 = icon('IconUserOutline16')
export const IconWarningOutline16 = icon('IconWarningOutline16')
