/**
 * Test-only stand-in for \`@deepseek-ai/dsh-client-ui-primitives\`.
 *
 * The atoms are a browser platform module the host seeds at runtime; Node (and
 * therefore vitest) cannot resolve the bare specifier. The client unit tests
 * only exercise registration wiring and never render, so neutral components are
 * enough. vitest.config.ts aliases the specifier here.
 */

/** A component that renders nothing; replaced by the real atom in the browser. */
const Atom = (): null => null

export const Button = Atom
export const Pill = Atom
export const Input = Atom
export const StateDot = Atom
export const DisclosureRow = Atom
export const Tooltip = Atom

export const IconArchiveOutline20 = Atom
export const IconChevronDownOutline14 = Atom
export const IconCheckOutline16 = Atom
export const IconEditOutline16 = Atom
export const IconLoadingOutline16 = Atom
export const IconPlayOutline16 = Atom
export const IconPlusOutline16 = Atom
export const IconRefreshOutline16 = Atom
export const IconSearchOutline16 = Atom
export const IconSkillOutline16 = Atom
export const IconSparkle16 = Atom
export const IconTrashOutline16 = Atom
export const IconUserOutline16 = Atom
export const IconWarningOutline16 = Atom
