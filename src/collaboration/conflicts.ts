import type { JsonValue } from './canonicalize.js'

/**
 * The conflict marker — the collaboration-surface shape of `editor.collab_conflicts`
 * (architecture §3.1, April §7.3 verbatim): one row per detected concurrent intent on a
 * single field, carrying the base value and both divergent values so a resolver can
 * present mine/theirs/both without re-reading the document history.
 *
 * Contract-only for now: markers are created and resolved by the Phase-2 conflict
 * surface (TASK-205) and surfaced to the frontend by the Phase-4 conflict UX; this file
 * fixes the shape both sides and the DDL agree on. `baseValue`/`leftValue`/`rightValue`
 * are `undefined` when absent (the `collab_conflicts` columns are nullable jsonb).
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:272 — collab_conflicts DDL
 * @see asma-modules/_docs/editor/qnrs/backend/architecture/2026-04-16-19-21-architecture-qnreditor-collaboration.md §7.3 — marker proposal
 */

/** A marker is open until the resolver chooses a side; resolution closes it. */
export type ConflictStatus = 'open' | 'resolved'

/** The four resolver outcomes — never a free-text note (that is manual review, out-of-band). */
export type ConflictResolution = 'mine' | 'theirs' | 'both' | 'manual'

export type ConflictMarker = {
    id: string
    documentId: string
    /** The entity family the conflict is on (`question`, `alternative`, `gridRow`, …). */
    entityType: string
    entityId: string
    /** Dotted path to the conflicting field within the entity, e.g. `label`, `scale.from`. */
    fieldPath: string
    baseValue?: JsonValue
    leftValue?: JsonValue
    rightValue?: JsonValue
    /** The two actors whose ops diverged (user ids). */
    leftPerformedBy: string
    rightPerformedBy: string
    status: ConflictStatus
    resolution?: ConflictResolution
}
