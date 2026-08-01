import type { AnswerValue } from './answerDocument.js'
import type { QuestionId, RowId } from './templateDocument.js'

/**
 * The filling (answer-document) op vocabulary (architecture §5, OQ-V2-24/44/47).
 *
 * Contract-only for now: the types are the Phase-0 deliverable so both sides of the
 * wire and the Phase-1 DDL agree on the shape; the reducer that applies them
 * (`applyAnswerOperation`) is a Phase-7 deliverable. The authoring vocabulary lives in
 * `operations.ts`; this one is deliberately separate because the two documents have
 * different mutability (OQ-V2-8) and different law regimes (the explicit `null` clear
 * marker is legal in answer state, never in the template document).
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:380 (filling vocabulary)
 */

export type AnswerOp =
    | { type: 'answer.set'; questionId: QuestionId; value: AnswerValue }
    | { type: 'answer.clear'; questionId: QuestionId }
    | { type: 'gridRow.add'; questionId: QuestionId; rowId: RowId; afterRowId?: RowId }
    | { type: 'gridRow.remove'; questionId: QuestionId; rowId: RowId }
    | { type: 'gridAnswer.set'; questionId: QuestionId; rowId: RowId; columnQuestionId: QuestionId; value: AnswerValue }

export type AnswerOpType = AnswerOp['type']

const ANSWER_OP_TYPE_COVERAGE: Record<AnswerOpType, true> = {
    'answer.set': true,
    'answer.clear': true,
    'gridRow.add': true,
    'gridRow.remove': true,
    'gridAnswer.set': true,
}

export const IMPLEMENTED_ANSWER_OP_TYPES = Object.keys(ANSWER_OP_TYPE_COVERAGE) as readonly AnswerOpType[]
