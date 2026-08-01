/**
 * The question-type register — the one place that says what a question can be.
 *
 * `QnrQuestion.type` is this union rather than `string` on purpose: the value is part of the stored
 * document and therefore part of `document_hash`, so a typo cannot be corrected later without a
 * document migration across every stored version. A closed union makes an unknown type a build
 * error on both sides instead of a row nobody can render.
 *
 * **The values are the legacy `QUESTION_TYPE` values verbatim, with exactly one rename**
 * (`CompositeQuestion` → `QuestionGrid`, OQ-V2-17). That is deliberate backward compatibility: 18 of
 * 19 types need no translation at all, so the import mapper and the reverse projection carry a
 * one-row table rather than a whole vocabulary, and the legacy wire keeps receiving the names it
 * always did.
 *
 * Transcribed from `asma-modules/editor/shared/types/questions/fields/Question.constants.ts`
 * (`QUESTION_TYPE`), which stays canonical for the **legacy** contract. It cannot be imported here:
 * it lives in the polyrepo root, outside both service repos' build contexts.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-21-20-analysis-qnr-template-field-inventory.md:365 — M-062 `q.type` → `question.type` (19-value enum)
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-21-20-analysis-qnr-template-field-inventory.md:417 — M-098 `q.subtype`
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-21-40-plan-qnr-stage2-new-model-editor-and-sync.md — OQ-V2-17 (CompositeQuestion → QuestionGrid)
 */

/** The legacy discriminator values, exactly as `templates.properties` stores them. */
export const LEGACY_QUESTION_TYPES = [
    'BooleanQuestion',
    'Chart',
    'CheckBoxes',
    'CompositeQuestion',
    'DateField',
    'DocumentUpload',
    'Dropdown',
    'Emoticons',
    'ExpressionQuestion',
    'FormatNumber',
    'LinearScale',
    'Link',
    'RadioButtons',
    'Readonly',
    'Space',
    'TextLong',
    'TextShort',
    'Title',
    'Widget',
] as const

export type LegacyQuestionType = (typeof LEGACY_QUESTION_TYPES)[number]

/** What a v2 document stores in `question.type`. */
export const QUESTION_TYPES = [
    'BooleanQuestion',
    'Chart',
    'CheckBoxes',
    'DateField',
    'DocumentUpload',
    'Dropdown',
    'Emoticons',
    'ExpressionQuestion',
    'FormatNumber',
    'LinearScale',
    'Link',
    'QuestionGrid',
    'RadioButtons',
    'Readonly',
    'Space',
    'TextLong',
    'TextShort',
    'Title',
    'Widget',
] as const

export type QuestionType = (typeof QUESTION_TYPES)[number]

/**
 * Only TextShort and TextLong carry one, and this is its whole vocabulary
 * (`TextShortSubtype` in the legacy register). Typed rather than left open because an unrecognized
 * subtype silently changes how an answer validates.
 */
export type QuestionSubtype = 'ORDINARY' | 'EMAIL'

/**
 * Written out in full rather than derived from the two arrays, so that `Record` makes TypeScript
 * prove the table covers every legacy value — a derived table would need a cast, and the cast is
 * exactly where a missing entry would hide.
 */
export const LEGACY_TO_V2_QUESTION_TYPE: Record<LegacyQuestionType, QuestionType> = {
    BooleanQuestion: 'BooleanQuestion',
    Chart: 'Chart',
    CheckBoxes: 'CheckBoxes',
    // The one rename in the whole register (OQ-V2-17): a "composite question" is a grid of
    // questions, and the legacy name says nothing about that.
    CompositeQuestion: 'QuestionGrid',
    DateField: 'DateField',
    DocumentUpload: 'DocumentUpload',
    Dropdown: 'Dropdown',
    Emoticons: 'Emoticons',
    ExpressionQuestion: 'ExpressionQuestion',
    FormatNumber: 'FormatNumber',
    LinearScale: 'LinearScale',
    Link: 'Link',
    RadioButtons: 'RadioButtons',
    Readonly: 'Readonly',
    Space: 'Space',
    TextLong: 'TextLong',
    TextShort: 'TextShort',
    Title: 'Title',
    Widget: 'Widget',
}

const V2_TO_LEGACY_QUESTION_TYPE = Object.fromEntries(
    Object.entries(LEGACY_TO_V2_QUESTION_TYPE).map(([legacy, v2]) => [v2, legacy]),
) as Record<QuestionType, LegacyQuestionType>

export const isQuestionType = (value: unknown): value is QuestionType =>
    typeof value === 'string' && (QUESTION_TYPES as readonly string[]).includes(value)

/**
 * Legacy → v2. Returns `undefined` for anything not in the register instead of passing the value
 * through: an unmapped type reaching a document would be a question no editor can render, and the
 * import has a report to record it in.
 */
export const toV2QuestionType = (legacy: string): QuestionType | undefined =>
    LEGACY_TO_V2_QUESTION_TYPE[legacy as LegacyQuestionType]

/** v2 → legacy, for the projection that writes back to the legacy wire. Total by construction. */
export const toLegacyQuestionType = (type: QuestionType): LegacyQuestionType => V2_TO_LEGACY_QUESTION_TYPE[type]
