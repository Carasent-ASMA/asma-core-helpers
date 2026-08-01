import type { DocScalar, QuestionId, RowId } from './templateDocument.js'

/**
 * The instance answer document (OQ-V2-8/24/44/47) — the filling-side sibling of the
 * template authoring document. It stores **answers only**: the definition comes from the
 * pinned immutable template version, never from here.
 *
 * **DOC-LAW-2's scoped exception lives here.** Absence means "never answered" in answer
 * state, so an explicit `null` encodes the genuinely different fact "answered then
 * cleared" — that is what keeps the journal dispatch from re-sending a prefilled value
 * after the recipient cleared it. The template document keeps the strict no-null rule;
 * this one does not.
 *
 * A grid row added at answer time is owned by this document (`answerGridRowsById` +
 * order arrays), not by the template — the template's predefined rows stay frozen in the
 * pinned version.
 *
 * The op vocabulary for this document (`answer.set/clear`, `gridRow.add/remove/move`,
 * `gridAnswer.set`) is defined in `answerOperations.ts`; the reducer is a Phase-7
 * deliverable, so this file and the op union are contract-only for now.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:181 (QnrAnswerDocument)
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:195 (DOC-LAW-2 exception)
 */

/**
 * An answer value. `null` is the deliberate-clear marker; a primitive array is legal
 * because DOC-LAW-1 allows primitive arrays (multi-select = selected alternative ids).
 */
export type AnswerValue = DocScalar | DocScalar[] | null

/** One instance-added grid row. `deleted: true` is the tombstone (OQ-V2-24). */
export type AnswerGridRow = {
    questionGridId: QuestionId
    /** The captured source-row identity — an opaque string, never parsed (OQ-V2-24). */
    entityRef?: string
    deleted?: true
}

export type QnrAnswerDocument = {
    documentId: string
    revision: number
    answersByQuestionId?: Record<QuestionId, AnswerValue>
    gridAnswersByQuestionId?: Record<QuestionId, Record<RowId, Record<QuestionId, AnswerValue>>>
    answerGridRowsById?: Record<RowId, AnswerGridRow>
    answerGridRowOrderByQuestionId?: Record<QuestionId, RowId[]>
}

/**
 * A fresh instance document. `answerGridRowOrderByQuestionId` is absent (no rows yet) —
 * unlike the template's `questionOrder`, nothing here is structural: the template's
 * question order already exists, and row order is only meaningful once rows exist.
 */
export const emptyAnswerDocument = (documentId: string): QnrAnswerDocument => ({
    documentId,
    revision: 0,
})
