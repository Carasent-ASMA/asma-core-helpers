import type { TemplateOp } from './operations.js'
import type { BindingTarget, QnrTemplateDocument, QuestionId } from './templateDocument.js'

/**
 * The authoring reducer. Pure: takes a document and an op, returns a new document with
 * `revision` bumped by one. The frontend applies it locally before the op leaves the
 * client and bunjs applies it authoritatively before the op becomes durable, so any
 * divergence between the two is a data-loss bug — hence one implementation, not two.
 *
 * Idempotency by `op_id` and revision assignment on the wire are persistence concerns
 * and deliberately live outside this function.
 *
 * @see _docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:380 (vocabulary)
 * @see _docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:384 (authoring dataflow)
 */

/**
 * Base for the reducer's typed failures. A plain `Error` subclass on purpose: this module
 * also runs in the browser, and bunjs's `CustomError` reaches `@hono/zod-openapi`, the AI
 * vendor error and the logger — none of which can ship to a client. It carries the two
 * fields the service's error resolver reads, so bunjs maps it losslessly to the same
 * status and code the `CustomError` subclasses produced (`processErrorDoNotNotify`).
 */
export class CollaborationError extends Error {
    readonly statusCode: number
    readonly code: string

    constructor(message: string, statusCode: number, code: string) {
        super(message)
        this.name = 'CollaborationError'
        this.statusCode = statusCode
        this.code = code
    }
}

export class UnknownOperationError extends CollaborationError {
    constructor(type: string) {
        super(`Unknown qnr template operation "${type}"`, 422, 'qnr_unknown_operation')
    }
}

export class OperationConflictError extends CollaborationError {
    constructor(message: string) {
        super(message, 409, 'qnr_operation_conflict')
    }
}

/** Serialises a binding target so the "one binding per target" invariant is checkable. */
const targetKey = (target: BindingTarget): string =>
    target.kind === 'question'
        ? `question:${target.questionId}`
        : `gridColumn:${target.gridQuestionId}:${target.columnQuestionId}`

/**
 * Sets a key, or removes it when the op carried an explicit unset.
 *
 * `field` may be a dotted path (`scale.from`). The per-type configuration in the document is nested
 * — `question.scale.{from, to, …}`, `question.numberFormat.{…}` — while an op value is a scalar, so
 * without a path those groups are unauthorable. Intermediate objects are created on write and
 * **removed again when their last key is unset**, because DOC-LAW-2 forbids storing an empty
 * collection: leaving `{ scale: {} }` behind would change `document_hash` for a document that
 * carries no scale at all.
 */
const writeField = <T extends Record<string, unknown>>(record: T, field: string, value: unknown): T => {
    const [head, ...rest] = field.split('.')
    if (head === undefined || head === '') return record

    const next = { ...record } as Record<string, unknown>

    if (rest.length === 0) {
        if (value === null || value === undefined) delete next[head]
        else next[head] = value
        return next as T
    }

    const child = next[head]
    const nested = writeField(
        (typeof child === 'object' && child !== null && !Array.isArray(child) ? child : {}) as Record<string, unknown>,
        rest.join('.'),
        value,
    )

    if (Object.keys(nested).length === 0) delete next[head]
    else next[head] = nested

    return next as T
}

/** Inserts `id` at `index`, clamped into range. Absent index appends. */
const insertAt = (order: readonly string[], id: string, index?: number): string[] => {
    const next = [...order]
    const at = index === undefined ? next.length : Math.max(0, Math.min(index, next.length))
    next.splice(at, 0, id)
    return next
}

const moveInOrder = (order: readonly string[], id: string, toIndex: number): string[] => {
    const without = order.filter((entry) => entry !== id)
    const at = Math.max(0, Math.min(toIndex, without.length))
    return [...without.slice(0, at), id, ...without.slice(at)]
}

const omitKey = <V>(record: Record<string, V>, key: string): Record<string, V> => {
    const { [key]: _removed, ...rest } = record
    return rest
}

/**
 * Spreads `patch` onto `base`, **omitting** keys whose value is `undefined` rather than
 * assigning it. Required by `exactOptionalPropertyTypes`: `{ ...doc, x: undefined }` is
 * a type error, and it is also the wrong shape — an absent key and a key holding
 * `undefined` serialise differently.
 */
const patchDocument = <T extends object>(base: T, patch: Record<string, unknown>): T => {
    const next = { ...base } as Record<string, unknown>
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete next[key]
        else next[key] = value
    }
    return next as T
}

/**
 * DOC-LAW-2 at the document boundary: an optional collection that just became empty is
 * removed, so two documents with the same content are the same document.
 *
 * `questionOrder` is exempt — it is the one structural array every reader indexes, and
 * making "no questions yet" indistinguishable from "malformed" would buy nothing.
 */
const OPTIONAL_COLLECTIONS = [
    'meta',
    'questionsById',
    'gridRowsById',
    'gridRowOrderByQuestionId',
    'alternativesById',
    'alternativeOrderByQuestionId',
    'tabsById',
    'tabOrder',
    'actionsById',
    'dataMappingsById',
    'mappingNodesById',
    'mappingBindingsById',
    'mappingFiltersById',
] as const

const prune = (doc: QnrTemplateDocument): QnrTemplateDocument => {
    const next = { ...doc } as Record<string, unknown>
    for (const key of OPTIONAL_COLLECTIONS) {
        const value = next[key]
        if (value === undefined) continue
        const isEmpty = Array.isArray(value)
            ? value.length === 0
            : typeof value === 'object' && value !== null && Object.keys(value).length === 0
        if (isEmpty) delete next[key]
    }
    return next as QnrTemplateDocument
}

/** Drops every binding whose target no longer resolves to an existing question. */
const dropBindingsForQuestion = (doc: QnrTemplateDocument, questionId: QuestionId): QnrTemplateDocument => {
    if (!doc.mappingBindingsById) return doc
    const kept = Object.entries(doc.mappingBindingsById).filter(([, binding]) => {
        const { target } = binding
        return target.kind === 'question'
            ? target.questionId !== questionId
            : target.gridQuestionId !== questionId && target.columnQuestionId !== questionId
    })
    return { ...doc, mappingBindingsById: Object.fromEntries(kept) }
}

export const applyOperation = (document: QnrTemplateDocument, op: TemplateOp): QnrTemplateDocument => {
    const next = reduce(document, op)
    return prune({ ...next, revision: document.revision + 1 })
}

/**
 * One switch over a closed vocabulary. Splitting it per entity family would hide the
 * `never` exhaustiveness check that turns an unhandled op into a compile error.
 */
const reduce = (doc: QnrTemplateDocument, op: TemplateOp): QnrTemplateDocument => {
    switch (op.type) {
        case 'template.updateMeta': {
            let meta = { ...(doc.meta ?? {}) }
            for (const [key, value] of Object.entries(op.patch)) {
                meta = writeField(meta, key, value)
            }
            return { ...doc, meta }
        }

        case 'question.create': {
            if (doc.questionsById?.[op.questionId]) {
                throw new OperationConflictError(`Question "${op.questionId}" already exists`)
            }
            return {
                ...doc,
                questionsById: { ...(doc.questionsById ?? {}), [op.questionId]: { type: op.questionType } },
                questionOrder: insertAt(doc.questionOrder, op.questionId, op.atIndex),
            }
        }

        case 'question.updateField': {
            const question = doc.questionsById?.[op.questionId]
            if (!question) {
                throw new OperationConflictError(`Unknown question "${op.questionId}"`)
            }
            return {
                ...doc,
                questionsById: {
                    ...doc.questionsById,
                    [op.questionId]: writeField(question, op.field, op.value),
                },
            }
        }

        case 'question.move': {
            if (!doc.questionsById?.[op.questionId]) {
                throw new OperationConflictError(`Unknown question "${op.questionId}"`)
            }
            return { ...doc, questionOrder: moveInOrder(doc.questionOrder, op.questionId, op.toIndex) }
        }

        case 'question.delete': {
            const alternativeIds = doc.alternativeOrderByQuestionId?.[op.questionId] ?? []
            let alternativesById = doc.alternativesById
            if (alternativesById) {
                alternativesById = alternativeIds.reduce((acc, id) => omitKey(acc, id), alternativesById)
            }
            const withoutQuestion = patchDocument(doc, {
                questionsById: doc.questionsById && omitKey(doc.questionsById, op.questionId),
                questionOrder: doc.questionOrder.filter((id) => id !== op.questionId),
                alternativesById,
                alternativeOrderByQuestionId:
                    doc.alternativeOrderByQuestionId && omitKey(doc.alternativeOrderByQuestionId, op.questionId),
                gridRowOrderByQuestionId:
                    doc.gridRowOrderByQuestionId && omitKey(doc.gridRowOrderByQuestionId, op.questionId),
            })
            // A binding pointing at a deleted question is an unresolvable reference the
            // compiler would reject at publication; drop it with its target.
            return dropBindingsForQuestion(withoutQuestion, op.questionId)
        }

        case 'alternative.create': {
            if (!doc.questionsById?.[op.questionId]) {
                throw new OperationConflictError(`Unknown question "${op.questionId}"`)
            }
            const order = doc.alternativeOrderByQuestionId?.[op.questionId] ?? []
            return {
                ...doc,
                alternativesById: {
                    ...(doc.alternativesById ?? {}),
                    [op.alternativeId]: op.label === undefined ? {} : { label: op.label },
                },
                alternativeOrderByQuestionId: {
                    ...(doc.alternativeOrderByQuestionId ?? {}),
                    [op.questionId]: insertAt(order, op.alternativeId, op.atIndex),
                },
            }
        }

        case 'alternative.updateField': {
            const alternative = doc.alternativesById?.[op.alternativeId]
            if (!alternative) {
                throw new OperationConflictError(`Unknown alternative "${op.alternativeId}"`)
            }
            // The question is checked too: an alternative id that exists but hangs off a different
            // question means the two clients disagree about the structure, not just the value, and
            // writing the field anyway would hide that behind a successful edit.
            if (!doc.alternativeOrderByQuestionId?.[op.questionId]?.includes(op.alternativeId)) {
                throw new OperationConflictError(
                    `Alternative "${op.alternativeId}" does not belong to question "${op.questionId}"`,
                )
            }
            return {
                ...doc,
                alternativesById: {
                    ...doc.alternativesById,
                    [op.alternativeId]: writeField(alternative, op.field, op.value),
                },
            }
        }

        case 'alternative.move': {
            const order = doc.alternativeOrderByQuestionId?.[op.questionId]
            if (!order?.includes(op.alternativeId)) {
                throw new OperationConflictError(
                    `Alternative "${op.alternativeId}" does not belong to question "${op.questionId}"`,
                )
            }
            return {
                ...doc,
                alternativeOrderByQuestionId: {
                    ...doc.alternativeOrderByQuestionId,
                    [op.questionId]: moveInOrder(order, op.alternativeId, op.toIndex),
                },
            }
        }

        case 'alternative.delete': {
            const order = doc.alternativeOrderByQuestionId?.[op.questionId] ?? []
            const remaining = order.filter((id) => id !== op.alternativeId)
            return patchDocument(doc, {
                alternativesById: doc.alternativesById && omitKey(doc.alternativesById, op.alternativeId),
                alternativeOrderByQuestionId: {
                    ...(doc.alternativeOrderByQuestionId ?? {}),
                    [op.questionId]: remaining,
                },
            })
        }

        case 'mappingNode.create': {
            if (doc.mappingNodesById?.[op.nodeId]) {
                throw new OperationConflictError(`Mapping node "${op.nodeId}" already exists`)
            }
            const node = writeField(
                writeField({ entityId: op.entityId }, 'parentNodeId', op.parentNodeId ?? null),
                'relationshipId',
                op.relationshipId ?? null,
            )
            return { ...doc, mappingNodesById: { ...(doc.mappingNodesById ?? {}), [op.nodeId]: node } }
        }

        case 'mappingNode.delete': {
            const filterIds = doc.mappingNodesById?.[op.nodeId]?.filterOrder ?? []
            let filtersById = doc.mappingFiltersById
            if (filtersById) {
                filtersById = filterIds.reduce((acc, id) => omitKey(acc, id), filtersById)
            }
            const bindings = Object.entries(doc.mappingBindingsById ?? {}).filter(
                ([, binding]) => binding.nodeId !== op.nodeId,
            )
            return patchDocument(doc, {
                mappingNodesById: doc.mappingNodesById && omitKey(doc.mappingNodesById, op.nodeId),
                mappingFiltersById: filtersById,
                mappingBindingsById: Object.fromEntries(bindings),
            })
        }

        case 'mappingBinding.create': {
            if (!doc.mappingNodesById?.[op.nodeId]) {
                throw new OperationConflictError(`Unknown mapping node "${op.nodeId}"`)
            }
            const wanted = targetKey(op.target)
            const clash = Object.entries(doc.mappingBindingsById ?? {}).find(
                ([, binding]) => targetKey(binding.target) === wanted,
            )
            if (clash) {
                throw new OperationConflictError(
                    `Target ${wanted} is already bound by "${clash[0]}" — at most one binding per target`,
                )
            }
            return {
                ...doc,
                mappingBindingsById: {
                    ...(doc.mappingBindingsById ?? {}),
                    [op.bindingId]: { nodeId: op.nodeId, fieldId: op.fieldId, target: op.target },
                },
            }
        }

        case 'mappingBinding.update': {
            const binding = doc.mappingBindingsById?.[op.bindingId]
            if (!binding) {
                throw new OperationConflictError(`Unknown mapping binding "${op.bindingId}"`)
            }
            if (op.patch.nodeId && !doc.mappingNodesById?.[op.patch.nodeId]) {
                throw new OperationConflictError(`Unknown mapping node "${op.patch.nodeId}"`)
            }
            return {
                ...doc,
                mappingBindingsById: {
                    ...doc.mappingBindingsById,
                    [op.bindingId]: { ...binding, ...op.patch },
                },
            }
        }

        case 'mappingBinding.delete':
            return patchDocument(doc, {
                mappingBindingsById: doc.mappingBindingsById && omitKey(doc.mappingBindingsById, op.bindingId),
            })

        case 'mappingFilter.set': {
            const node = doc.mappingNodesById?.[op.nodeId]
            if (!node) {
                throw new OperationConflictError(`Unknown mapping node "${op.nodeId}"`)
            }
            const filterOrder = node.filterOrder ?? []
            const filter = writeField({ fieldId: op.fieldId, operator: op.operator }, 'value', op.value ?? null)
            return {
                ...doc,
                mappingFiltersById: { ...(doc.mappingFiltersById ?? {}), [op.filterId]: filter },
                mappingNodesById: {
                    ...doc.mappingNodesById,
                    [op.nodeId]: {
                        ...node,
                        filterOrder: filterOrder.includes(op.filterId) ? filterOrder : [...filterOrder, op.filterId],
                    },
                },
            }
        }

        case 'mappingFilter.delete': {
            const nodes = Object.fromEntries(
                Object.entries(doc.mappingNodesById ?? {}).map(([nodeId, node]) => [
                    nodeId,
                    node.filterOrder?.includes(op.filterId)
                        ? { ...node, filterOrder: node.filterOrder.filter((id) => id !== op.filterId) }
                        : node,
                ]),
            )
            return patchDocument(doc, {
                mappingFiltersById: doc.mappingFiltersById && omitKey(doc.mappingFiltersById, op.filterId),
                mappingNodesById: nodes,
            })
        }

        default: {
            // Exhaustiveness: a new op member makes this a compile error, not a silent no-op.
            const unhandled: never = op
            throw new UnknownOperationError((unhandled as { type?: string })?.type ?? 'undefined')
        }
    }
}
