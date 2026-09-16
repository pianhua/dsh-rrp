/**
 * dsh-rrp — the RP reading theme (P0).
 *
 * The default shell reads like a coding tool. We stack an override layer over
 * the user's ACTIVE theme (never changing their saved preference): warmer paper
 * tones, a serif narrative face, and a looser narrative line height.
 * \`overrideTokens\` is reversible and only affects the profile that loads this
 * client plugin, so the daily instance is untouched.
 */
import type { RrpClientContext } from './context-types.ts'

/** Override-layer owner, so this layer can be replaced/removed cleanly. */
const SOURCE = 'dsh-rrp'
const TAG = '[dsh-rrp]'

/** A narrative serif stack that degrades gracefully on every platform. */
const NARRATIVE_FAMILY = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, Georgia, serif'

/** Tokens applied while this plugin is mounted (both palette modes required). */
const RP_TOKENS: Record<string, { light: string; dark: string }> = {
  '--dsw-alias-bg-base': { light: '#f6f1e7', dark: '#17151a' },
  '--dsw-alias-bg-layer-1': { light: '#fbf7ef', dark: '#201d24' },
  '--dsw-alias-bg-layer-2': { light: '#f1eadc', dark: '#282430' },
  '--dsw-alias-bg-layer-3': { light: '#ebe2d1', dark: '#302b38' },
  '--dsw-alias-label-primary': { light: '#2c2620', dark: '#e9e2d6' },
  '--dsw-alias-label-secondary': { light: '#5c5145', dark: '#bdb2a2' },
  '--dsw-alias-label-tertiary': { light: '#867a6a', dark: '#8f8578' },
  '--dsw-alias-border-l1': { light: 'rgba(120,100,70,0.22)', dark: 'rgba(220,200,170,0.16)' },
  '--dsw-alias-border-l2': { light: 'rgba(120,100,70,0.32)', dark: 'rgba(220,200,170,0.24)' },
  '--dsw-alias-border-l3': { light: 'rgba(120,100,70,0.42)', dark: 'rgba(220,200,170,0.32)' },
  '--dsw-alias-brand-primary': { light: '#8a5a2b', dark: '#d8a86a' },
  '--dsw-alias-brand-text': { light: '#8a5a2b', dark: '#e0b47c' },
  '--dsw-font-markdown-base-font-family': { light: NARRATIVE_FAMILY, dark: NARRATIVE_FAMILY },
  '--dsw-font-markdown-base-font-size': { light: '16.5px', dark: '16.5px' },
  '--dsw-font-markdown-base-line-height': { light: '1.95', dark: '1.95' },
}

/**
 * Apply the RP reading theme, and remove it on dispose.
 * @param ctx - the client context owning the registration.
 */
export function registerRpTheme(ctx: RrpClientContext): void {
  const theme = ctx.theme
  if (theme === undefined) {
    console.warn(TAG + ' theme idle (missing ctx.theme)')
    return
  }
  ctx.effect(() => {
    let dispose: () => void
    try {
      dispose = theme.overrideTokens(SOURCE, RP_TOKENS)
    } catch (error) {
      console.warn(TAG + ' theme override rejected:', error)
      return () => {}
    }
    console.log(TAG + ' RP reading theme applied')
    return dispose
  }, 'dsh-rrp: RP theme')
}
