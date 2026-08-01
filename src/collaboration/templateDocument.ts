/**
 * The template authoring document — a normalized entity graph with stable ids and
 * explicit order arrays, in DOC-LAW-1 / DOC-LAW-2 minimal form.
 *
 * Every collection is optional because DOC-LAW-2 forbids storing an empty one: a
 * document with no alternatives has no `alternativesById` key at all. Readers hydrate
 * to a total in-memory model once at the document boundary rather than writing `?? {}`
 * at each use site.
 *
 * @see _docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:152 (document shape)
 * @see _docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:193 (DOC-LAW-1)
 * @see _docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:214 (§2.2a mapping graph)
 */

import type { QuestionSubtype, QuestionType } from './questionTypes.js'

export type QuestionId = string
export type RowId = string
export type AltId = string
export type TabId = string
export type ActionId = string
export type NodeId = string
export type BindingId = string
export type FilterId = string
export type MappingId = string

/** A scalar a document may carry. Deliberately not `any`: DOC-LAW-2 bans `null`. */
export type DocScalar = string | number | boolean

/**
 * `type` is the question's own discriminator (M-062), a closed union rather than a string — see
 * `questionTypes.ts` for why the value cannot be loose. Not to be confused with the other `kind`
 * slots in this file: `QnrAction.kind` and `BindingTarget.kind` discriminate *structure*, not the
 * question a user authored.
 */
export type QnrQuestion = {
    type: QuestionType
    subtype?: QuestionSubtype
    label?: string
    required?: boolean
    defaultValue?: DocScalar
    [key: string]: unknown
}

export type QnrAlternative = { label?: string; value?: DocScalar; [key: string]: unknown }
export type QnrGridRow = { label?: string; [key: string]: unknown }
export type QnrTab = { label?: string; [key: string]: unknown }
export type QnrAction = { kind?: string; [key: string]: unknown }

/** One traversal step. Many questions off one entity share a single node (§2.2a). */
export type MappingNode = {
    entityId: string
    parentNodeId?: NodeId
    relationshipId?: string
    filterOrder?: FilterId[]
    [key: string]: unknown
}

/**
 * A binding's target. A `gridColumn` target is a pair, which is why the binding key is
 * a synthetic id rather than the question id (§2.2a).
 */
export type BindingTarget =
    | { kind: 'question'; questionId: QuestionId }
    | { kind: 'gridColumn'; gridQuestionId: QuestionId; columnQuestionId: QuestionId }

export type MappingBinding = {
    nodeId: NodeId
    fieldId: string
    target: BindingTarget
    cardinality?: string
    onMissing?: string
    onMany?: string
    [key: string]: unknown
}

/** Carries no `nodeId` back-pointer: the node already lists it (§2.2a). */
export type MappingFilter = {
    fieldId: string
    operator: string
    value?: DocScalar
}

export type QnrTemplateDocument = {
    documentId: string
    revision: number
    meta?: Record<string, unknown>
    questionsById?: Record<QuestionId, QnrQuestion>
    questionOrder: QuestionId[]
    gridRowsById?: Record<RowId, QnrGridRow>
    gridRowOrderByQuestionId?: Record<QuestionId, RowId[]>
    alternativesById?: Record<AltId, QnrAlternative>
    alternativeOrderByQuestionId?: Record<QuestionId, AltId[]>
    tabsById?: Record<TabId, QnrTab>
    tabOrder?: TabId[]
    actionsById?: Record<ActionId, QnrAction>
    dataMappingsById?: Record<MappingId, { sourceId: string; rootNodeId: NodeId; bindingOrder?: BindingId[] }>
    mappingNodesById?: Record<NodeId, MappingNode>
    mappingBindingsById?: Record<BindingId, MappingBinding>
    mappingFiltersById?: Record<FilterId, MappingFilter>
}

/**
 * A new family's document. `questionOrder` is present-and-empty rather than absent
 * because it is the document's only structural array and every reader indexes it; an
 * absent order array would make "no questions yet" and "malformed" the same shape.
 */
export const emptyTemplateDocument = (documentId: string): QnrTemplateDocument => ({
    documentId,
    revision: 0,
    questionOrder: [],
})
