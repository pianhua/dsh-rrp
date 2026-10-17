/**
 * dsh-rrp — the harness home resolver, shared by the preset materializer and
 * the card loader. Kept in its own leaf module so neither has to import the
 * other (which would create a cycle).
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The harness home; mirrors @deepseek-ai/dsh-agent-presets' shipped default. */
export function harnessHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}
