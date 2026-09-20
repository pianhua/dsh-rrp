/**
 * dsh-rrp — the unified Agent Prompt Contract (issue #32).
 *
 * Every agent in this engine — the prose-writing Author and the four
 * structured background agents — exposes the same six-layer contract:
 *
 *   1. 身份定位 (Role & Stance)      — who speaks, to whom, in what voice;
 *   2. 核心职责 (Core Mandate)       — the single non-negotiable duty;
 *   3. 输入契约 (Input Contract)     — what arrives in the user message;
 *   4. 铁律红线 (Iron Rules)         — numbered negative constraints;
 *   5. 输出契约 (Output Protocol)    — strict format (prose / JSON / action block);
 *   6. 质量与反幻觉 (Quality)        — no vacuity, no hallucination, self-check.
 *
 * Engineering invariants shared by all agents:
 * - `systemPrompt` is byte-stable per release: all volatile data rides the
 *   user message (built by `buildUserPrompt`) so the provider prefix cache
 *   survives across turns (M1).
 * - Structured agents bind a Zod `outputSchema`; `parseReply` must tolerate
 *   prose wrappers, Markdown fences, and mid-stream truncation, returning
 *   `undefined` when nothing usable survives.
 * - The narrative-vs-data split is absolute: the Author's literary license
 *   and anti-cliché lexicon NEVER leak into the background agents, and the
 *   background agents' JSON discipline never constrains the Author's prose.
 */
import type { ZodType } from 'zod'

/** The five first-class agents of this engine. */
export type AgentId = 'author' | 'chronicler' | 'summarizer' | 'scribe' | 'copilot'

/**
 * dsh-rrp 统一 Agent 提示词规范契约.
 * @typeParam TInput - the material `buildUserPrompt` assembles into one user message.
 * @typeParam TOutput - the validated value `parseReply` returns.
 */
export interface AgentPromptContract<TInput, TOutput> {
  /** Stable agent identifier. */
  readonly id: AgentId
  /** Human-readable role name (ZH). */
  readonly name: string
  /** Static system prompt: byte-stable per release for prefix-cache affinity. */
  readonly systemPrompt: string
  /** Assemble the user message: static context first, volatile input last. */
  buildUserPrompt(input: TInput): string
  /** Parse and validate a raw reply; `undefined` means "unusable, fall back". */
  parseReply(rawReply: string): TOutput | undefined
  /** Bound Zod schema — mandatory for structured-output agents. */
  readonly outputSchema?: ZodType
}
