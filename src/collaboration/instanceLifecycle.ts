/**
 * The instance lifecycle vocabulary (OQ-V2-19 ✅, Igor 2026-07-30) — the one place that
 * says what `qnrs.lifecycle_status` can hold, for the frontend filling surface and bunjs
 * alike.
 *
 * Five statuses are STORED; two more are DERIVED at read time and never written:
 *
 * - `in_progress` — derived from "any answer value exists" (OQ-V2-44/45 own that fact;
 *   legacy has one writer and no logic reader for the stored `IN_PROGRESS` value).
 * - `expired` — derived from `valid_to < now()` (nothing in legacy ever writes `EXPIRED`;
 *   expiry is already a read-time date comparison).
 *
 * The full per-value evidence and the legal transition table (which transitions are
 * server-enforced commands and why) live in the pre-DDL guardrails §3.3.1; this module
 * deliberately does not duplicate the transition table — Phase 7 owns it.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-21-40-plan-qnr-stage2-new-model-editor-and-sync.md:180 — OQ-V2-19
 * @see asma-modules/_docs/editor/qnrs/backend/architecture/2026-07-13-23-25-architecture-qnr-v2-db-design-pre-ddl-guardrails.md §3.3.1 — transitions
 */

/** The five stored values. `AWAITING_REPLY` is deliberately NOT renamed (OQ-V2-19). */
export const LIFECYCLE_STATUSES = ['inbound', 'awaiting_reply', 'completed', 'processed', 'rejected'] as const

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number]

/** The two read-time derivations — never columns, never stored (OQ-V2-19). */
export type DerivedLifecycleStatus = 'in_progress' | 'expired'

export type LifecycleView = LifecycleStatus | DerivedLifecycleStatus

/** Derivation rule for `in_progress` (OQ-V2-19): any answer value exists. */
export const deriveInProgress = (hasAnyAnswerValue: boolean): boolean => hasAnyAnswerValue

/** Derivation rule for `expired` (OQ-V2-19): `valid_to < now()`. */
export const deriveExpired = (validTo: Date, now: Date): boolean => validTo.getTime() < now.getTime()

export const isLifecycleStatus = (value: unknown): value is LifecycleStatus =>
    typeof value === 'string' && (LIFECYCLE_STATUSES as readonly string[]).includes(value)
