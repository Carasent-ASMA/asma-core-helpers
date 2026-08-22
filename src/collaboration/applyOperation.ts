import type { TemplateOp } from './operations.js'
import type {
    MappingNode,
    QnrDataMapping,
    QnrQuestion,
    QnrTemplateDocument,
    QuestionId,
} from './templateDocument.js'
import { bindingTargetKey } from './templateDocument.js'

/**
 * The authoring reducer. Pure: takes a document and an op, returns a new document with
 * `revision` bumped by one. The frontend applies it locally before the op leaves the
 * client and bunjs applies it authoritatively before the op becomes durable, so any
 * divergence between the two is a data-loss bug — hence one implementation, not two.
 *
 * Idempotency by `op_id` and revision assignment on the wire are persistence concerns
 * and deliberately live outside this function.
 *
 * Create ops mint a transient empty record when no initial field is supplied (`{}`): it
 * carries no information, `reduceToMinimalForm` erases it from the canonical form, and
 * `findDocLawViolations` flags it at publish time — so it never reaches a stored version
 * and two clients taking different routes to the same content still agree on the hash.
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
const targetKey = bindingTargetKey

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
 * The document paths a grid operation owns, and no other op may write.
 *
 * `grid.columnIds` is the ownership array a question's single structural owner is read from
 * (`gridColumn.create`/`move` maintain it), and `presentation.rowEditor.layoutByQuestionId`
 * holds one placement per column (`gridColumn.setLayout` writes exactly one). An op that
 * carries a scalar or a flat primitive array can only write such a map *wholesale*, so
 * reaching either path through `question.updateField` replaces or clears it — columns left
 * owned by nobody, or every other column's placement dropped in one edit. That is precisely
 * the atomicity the grid ops exist to provide, so the paths are reserved for them.
 */
const GRID_OWNED_FIELD_PATHS = ['grid.columnIds', 'presentation.rowEditor.layoutByQuestionId'] as const

/**
 * The reserved path `field` would write, if any. Both directions count: the path itself, a
 * path *below* it (`grid.columnIds.0`), and an *ancestor* whose write would take the reserved
 * map with it (`grid`, `presentation.rowEditor`).
 */
const reservedGridFieldPath = (field: string): string | undefined =>
    GRID_OWNED_FIELD_PATHS.find(
        (owned) => field === owned || field.startsWith(`${owned}.`) || owned.startsWith(`${field}.`),
    )

const requireGridQuestion = (doc: QnrTemplateDocument, questionId: QuestionId): QnrQuestion => {
    const question = doc.questionsById?.[questionId]
    if (!question) throw new OperationConflictError(`Unknown question "${questionId}"`)
    if (question.type !== 'QuestionGrid') {
        throw new OperationConflictError(`Question "${questionId}" is not a question grid`)
    }
    return question
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
    'visibilityRulesById',
    'visibilityRuleOrderByQuestionId',
    'highlightRulesById',
    'highlightRuleOrderByQuestionId',
    'narrativeRulesById',
    'narrativeRuleOrderByQuestionId',
    'qnrRulesById',
    'qnrRuleOrderByQuestionId',
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

/**
 * Writes a question's order array, or drops its key when the last member left — DOC-LAW-2
 * stores no empty array, and `{ q1: [] }` would also hash differently from the key's absence.
 */
const setOrRemoveOrder = (
    orderByQuestionId: Record<QuestionId, string[]> | undefined,
    questionId: QuestionId,
    ids: string[],
): Record<QuestionId, string[]> => {
    const map = { ...(orderByQuestionId ?? {}) }
    if (ids.length === 0) delete map[questionId]
    else map[questionId] = ids
    return map
}

/**
 * Shared setter for the per-question rule collections (visibility/highlight). A rule has exactly
 * one owner: setting it under a different question MOVES it there, so it can never sit in two
 * order arrays at once — and the previous owner's key goes when its last rule leaves (DOC-LAW-2).
 */
const setScopedRule = <T extends object>(
    rulesById: Record<string, T> | undefined,
    orderByQuestionId: Record<QuestionId, string[]> | undefined,
    ruleId: string,
    questionId: QuestionId,
    rule: T,
): { rulesById: Record<string, T>; orderByQuestionId: Record<QuestionId, string[]> } => {
    const orders: Record<QuestionId, string[]> = {}
    for (const [ownerId, ruleIds] of Object.entries(orderByQuestionId ?? {})) {
        const kept = ownerId === questionId ? ruleIds : ruleIds.filter((id) => id !== ruleId)
        if (kept.length > 0) orders[ownerId] = kept
    }
    const order = orders[questionId] ?? []
    orders[questionId] = order.includes(ruleId) ? order : [...order, ruleId]
    return {
        rulesById: { ...(rulesById ?? {}), [ruleId]: rule },
        orderByQuestionId: orders,
    }
}

/** Removes one scoped rule and any order key emptied by that removal. */
const deleteScopedRule = <T>(
    rulesById: Record<string, T> | undefined,
    orderByQuestionId: Record<QuestionId, string[]> | undefined,
    ruleId: string,
): { rulesById: Record<string, T>; orderByQuestionId: Record<QuestionId, string[]> } => {
    const orders: Record<QuestionId, string[]> = {}
    for (const [questionId, ruleIds] of Object.entries(orderByQuestionId ?? {})) {
        const kept = ruleIds.filter((id) => id !== ruleId)
        if (kept.length > 0) orders[questionId] = kept
    }
    return {
        rulesById: rulesById ? omitKey(rulesById, ruleId) : {},
        orderByQuestionId: orders,
    }
}

/**
 * Walks `parentNodeId` links to the root of the node's traversal tree. A cycle is malformed
 * data; bailing with `undefined` treats the node as unattached rather than hanging the reducer.
 */
const rootOfNode = (doc: QnrTemplateDocument, nodeId: string): string | undefined => {
    const visited = new Set<string>()
    let current: string | undefined = nodeId
    while (current !== undefined && !visited.has(current)) {
        visited.add(current)
        const node: MappingNode | undefined = doc.mappingNodesById?.[current]
        if (node === undefined) return undefined
        if (node.parentNodeId === undefined) return current
        current = node.parentNodeId
    }
    return undefined
}

/** The data mapping whose traversal tree contains `nodeId`, when the tree is attached to one. */
const mappingForNode = (doc: QnrTemplateDocument, nodeId: string): [string, QnrDataMapping] | undefined => {
    const rootId = rootOfNode(doc, nodeId)
    if (rootId === undefined) return undefined
    return Object.entries(doc.dataMappingsById ?? {}).find(([, mapping]) => mapping.rootNodeId === rootId)
}

/** Every node of the traversal tree under `rootNodeId`, root included. */
const collectTreeNodeIds = (doc: QnrTemplateDocument, rootNodeId: string): Set<string> => {
    const ids = new Set<string>()
    const queue = [rootNodeId]
    while (queue.length > 0) {
        const current = queue.pop() as string
        if (ids.has(current)) continue
        ids.add(current)
        for (const [nodeId, node] of Object.entries(doc.mappingNodesById ?? {})) {
            if (node.parentNodeId === current) queue.push(nodeId)
        }
    }
    return ids
}

/**
 * Removes the given binding ids from every `bindingOrder` — a deleted binding must not leave
 * its id behind in the order array (dangling prevention by construction, §2.2a).
 */
const scrubBindingOrders = (doc: QnrTemplateDocument, bindingIds: ReadonlySet<string>): QnrTemplateDocument => {
    if (!doc.dataMappingsById) return doc
    let changed = false
    const next: Record<string, QnrDataMapping> = {}
    for (const [mappingId, mapping] of Object.entries(doc.dataMappingsById)) {
        if (!mapping.bindingOrder?.some((id) => bindingIds.has(id))) {
            next[mappingId] = mapping
            continue
        }
        changed = true
        const kept = mapping.bindingOrder.filter((id) => !bindingIds.has(id))
        if (kept.length > 0) {
            next[mappingId] = { ...mapping, bindingOrder: kept }
        } else {
            // DOC-LAW-2: an emptied order array is dropped, never stored.
            const { bindingOrder: _removed, ...rest } = mapping
            next[mappingId] = rest
        }
    }
    return changed ? { ...doc, dataMappingsById: next } : doc
}

type ScrubbedPresentation = { value: Record<string, unknown>; changed: boolean }

/**
 * Removes a question key from convention-owned presentation maps at any depth. The
 * presentation bag deliberately has an open index, so enumerating today's layout and
 * width maps would make tomorrow's map retain dangling column state.
 */
const scrubPresentationQuestionMaps = (
    value: Record<string, unknown>,
    questionId: QuestionId,
): ScrubbedPresentation => {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
        if (typeof child !== 'object' || child === null || Array.isArray(child)) {
            next[key] = child
            continue
        }

        if (key.endsWith('ByQuestionId')) {
            const map = child as Record<string, unknown>
            if (!(questionId in map)) {
                next[key] = child
                continue
            }
            changed = true
            const kept = omitKey(map, questionId)
            if (Object.keys(kept).length > 0) next[key] = kept
            continue
        }

        const nested = scrubPresentationQuestionMaps(child as Record<string, unknown>, questionId)
        changed ||= nested.changed
        if (!nested.changed || Object.keys(nested.value).length > 0) next[key] = nested.value
    }
    return { value: changed ? next : value, changed }
}

/**
 * Removes a deleted question's id from every record owned by a grid: its ordered
 * columns, authored row cells, and convention-named presentation maps.
 */
const dropFromGridColumns = (doc: QnrTemplateDocument, questionId: QuestionId): QnrTemplateDocument => {
    let changed = false
    const nextQuestions: typeof doc.questionsById = {}
    for (const [qid, question] of Object.entries(doc.questionsById ?? {})) {
        // Defensive: the per-type bags are open, so a malformed `columnIds` must not crash
        // the reducer — it is a schema violation for validation to catch, not a crash here.
        const columnIds = question.grid?.columnIds
        let nextQuestion: QnrQuestion = question
        if (Array.isArray(columnIds) && columnIds.includes(questionId)) {
            changed = true
            const kept = columnIds.filter((id) => id !== questionId)
            const grid = { ...question.grid }
            if (kept.length === 0) delete grid.columnIds
            else grid.columnIds = kept
            nextQuestion = { ...nextQuestion, grid }
            if (Object.keys(grid).length === 0) delete nextQuestion.grid
        }

        if (question.presentation) {
            const scrubbed = scrubPresentationQuestionMaps(question.presentation, questionId)
            if (scrubbed.changed) {
                changed = true
                nextQuestion = { ...nextQuestion }
                if (Object.keys(scrubbed.value).length === 0) delete nextQuestion.presentation
                else nextQuestion.presentation = scrubbed.value
            }
        }
        nextQuestions[qid] = nextQuestion
    }

    const nextRows: typeof doc.gridRowsById = {}
    for (const [rowId, row] of Object.entries(doc.gridRowsById ?? {})) {
        if (!row.cells || !(questionId in row.cells)) {
            nextRows[rowId] = row
            continue
        }
        changed = true
        const cells = omitKey(row.cells, questionId)
        const nextRow = { ...row }
        if (Object.keys(cells).length === 0) delete nextRow.cells
        else nextRow.cells = cells
        nextRows[rowId] = nextRow
    }

    if (!changed) return doc
    return patchDocument(doc, {
        questionsById: doc.questionsById ? nextQuestions : undefined,
        gridRowsById: doc.gridRowsById ? nextRows : undefined,
    })
}

/**
 * Every question a grid owns, transitively, the grid itself excluded. `seen` makes it total on
 * malformed data: an ownership cycle is not authorable but is importable, and a delete must
 * terminate on one rather than blow the stack.
 */
const collectOwnedColumnIds = (doc: QnrTemplateDocument, gridQuestionId: QuestionId): QuestionId[] => {
    const owned: QuestionId[] = []
    const seen = new Set<QuestionId>([gridQuestionId])
    const queue: QuestionId[] = [gridQuestionId]
    while (queue.length > 0) {
        const current = queue.pop() as QuestionId
        const question = doc.questionsById?.[current]
        // Only a grid owns columns; the per-type bag is open, so a malformed `columnIds` must
        // not crash the reducer — that is a schema violation for validation to report.
        const columnIds = question?.type === 'QuestionGrid' ? question.grid?.columnIds : undefined
        if (!Array.isArray(columnIds)) continue
        for (const columnId of columnIds) {
            if (seen.has(columnId)) continue
            seen.add(columnId)
            owned.push(columnId)
            queue.push(columnId)
        }
    }
    return owned
}

/**
 * Removes one question and everything it alone owns: its alternatives, its own rules, its
 * predefined grid rows, its place in any grid's column list and every binding aimed at it.
 * `question.delete` applies it to the deleted question and to each column that grid owns.
 */
const deleteQuestion = (doc: QnrTemplateDocument, questionId: QuestionId): QnrTemplateDocument => {
    // A grid's predefined rows go with it: the order key is dropped below, and a row record
    // no order array reaches is unreachable state that still changes `document_hash`.
    const rowIds = doc.gridRowOrderByQuestionId?.[questionId] ?? []
    let gridRowsById = doc.gridRowsById
    if (gridRowsById) {
        gridRowsById = rowIds.reduce((acc, id) => omitKey(acc, id), gridRowsById)
    }
    const alternativeIds = doc.alternativeOrderByQuestionId?.[questionId] ?? []
    let alternativesById = doc.alternativesById
    if (alternativesById) {
        alternativesById = alternativeIds.reduce((acc, id) => omitKey(acc, id), alternativesById)
    }
    // The question's own rules go with it, the same way its alternatives do: an orphaned
    // rule record is referenced by no order array and only pollutes the hash. Rules of
    // OTHER questions whose condition points at this one are deliberately KEPT — silently
    // dropping a surviving question's authored logic would be data loss, so the dangling
    // `sourceQuestionId` is left for validation to surface instead.
    const visibilityRuleIds = doc.visibilityRuleOrderByQuestionId?.[questionId] ?? []
    let visibilityRulesById = doc.visibilityRulesById
    if (visibilityRulesById) {
        visibilityRulesById = visibilityRuleIds.reduce((acc, id) => omitKey(acc, id), visibilityRulesById)
    }
    const highlightRuleIds = doc.highlightRuleOrderByQuestionId?.[questionId] ?? []
    let highlightRulesById = doc.highlightRulesById
    if (highlightRulesById) {
        highlightRulesById = highlightRuleIds.reduce((acc, id) => omitKey(acc, id), highlightRulesById)
    }
    const narrativeRuleIds = doc.narrativeRuleOrderByQuestionId?.[questionId] ?? []
    let narrativeRulesById = doc.narrativeRulesById
    if (narrativeRulesById) {
        narrativeRulesById = narrativeRuleIds.reduce((acc, id) => omitKey(acc, id), narrativeRulesById)
    }
    const qnrRuleIds = doc.qnrRuleOrderByQuestionId?.[questionId] ?? []
    let qnrRulesById = doc.qnrRulesById
    if (qnrRulesById) {
        qnrRulesById = qnrRuleIds.reduce((acc, id) => omitKey(acc, id), qnrRulesById)
    }
    const withoutQuestion = patchDocument(doc, {
        questionsById: doc.questionsById && omitKey(doc.questionsById, questionId),
        questionOrder: doc.questionOrder.filter((id) => id !== questionId),
        alternativesById,
        alternativeOrderByQuestionId:
            doc.alternativeOrderByQuestionId && omitKey(doc.alternativeOrderByQuestionId, questionId),
        gridRowsById,
        gridRowOrderByQuestionId: doc.gridRowOrderByQuestionId && omitKey(doc.gridRowOrderByQuestionId, questionId),
        visibilityRulesById,
        visibilityRuleOrderByQuestionId:
            doc.visibilityRuleOrderByQuestionId && omitKey(doc.visibilityRuleOrderByQuestionId, questionId),
        highlightRulesById,
        highlightRuleOrderByQuestionId:
            doc.highlightRuleOrderByQuestionId && omitKey(doc.highlightRuleOrderByQuestionId, questionId),
        narrativeRulesById,
        narrativeRuleOrderByQuestionId:
            doc.narrativeRuleOrderByQuestionId && omitKey(doc.narrativeRuleOrderByQuestionId, questionId),
        qnrRulesById,
        qnrRuleOrderByQuestionId:
            doc.qnrRuleOrderByQuestionId && omitKey(doc.qnrRuleOrderByQuestionId, questionId),
    })
    // A binding pointing at a deleted question is an unresolvable reference the
    // compiler would reject at publication; drop it with its target. A grid column
    // list pointing at it is the same class of reference and goes the same way.
    return dropBindingsForQuestion(dropFromGridColumns(withoutQuestion, questionId), questionId)
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

        case 'template.updateSettings': {
            let meta = { ...(doc.meta ?? {}) }
            let settings = { ...(meta.settings ?? {}) }
            for (const [key, value] of Object.entries(op.patch)) {
                settings = writeField(settings, key, value)
            }
            if (Object.keys(settings).length === 0) delete meta.settings
            else meta.settings = settings
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
            // `type` is the question's identity, not one of its fields: `question.create` sets it and
            // every per-type shape hangs off it. A field write moves it alone — a grid flipped to
            // another type keeps the `grid.columnIds` the document schema admits on no other type,
            // its columns then owned by nobody and no longer cascading with its delete.
            if (op.field === 'type' || op.field.startsWith('type.')) {
                throw new OperationConflictError(
                    `Field "${op.field}" writes the question type, which only question.create may set`,
                )
            }
            const reserved = reservedGridFieldPath(op.field)
            if (reserved !== undefined) {
                throw new OperationConflictError(
                    `Field "${op.field}" writes "${reserved}", which only the gridColumn operations may author`,
                )
            }
            // `grid` is the grid's own configuration and the document schema admits it on no
            // other type, so authoring it through an ordinary question would store a bag no
            // reader projects and the publication schema then refuses.
            if (question.type !== 'QuestionGrid' && op.field.split('.')[0] === 'grid') {
                throw new OperationConflictError(
                    `Question "${op.questionId}" is not a question grid, so "${op.field}" is not authorable on it`,
                )
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
            if (!doc.questionOrder.includes(op.questionId)) {
                throw new OperationConflictError(`Question "${op.questionId}" is not top-level`)
            }
            return { ...doc, questionOrder: moveInOrder(doc.questionOrder, op.questionId, op.toIndex) }
        }

        case 'question.delete': {
            // A grid owns its columns, so they go with it: they sit in no order array of their
            // own, and leaving them behind is the orphan half of the ownership invariant. The
            // whole ownership subtree is collected first, then each question is removed on its
            // own terms — its alternatives, rules and bindings included.
            const ids = [op.questionId, ...collectOwnedColumnIds(doc, op.questionId)]
            return ids.reduce((acc, id) => deleteQuestion(acc, id), doc)
        }

        case 'gridColumn.create': {
            const gridQuestion = requireGridQuestion(doc, op.questionId)
            if (doc.questionsById?.[op.columnQuestionId]) {
                throw new OperationConflictError(`Question "${op.columnQuestionId}" already exists`)
            }
            const columnIds = gridQuestion.grid?.columnIds ?? []
            return {
                ...doc,
                questionsById: {
                    ...doc.questionsById,
                    [op.questionId]: {
                        ...gridQuestion,
                        grid: {
                            ...(gridQuestion.grid ?? {}),
                            columnIds: insertAt(columnIds, op.columnQuestionId, op.atIndex),
                        },
                    },
                    [op.columnQuestionId]: { type: op.questionType },
                },
            }
        }

        case 'gridColumn.move': {
            const gridQuestion = requireGridQuestion(doc, op.questionId)
            const columnIds = gridQuestion.grid?.columnIds
            if (!doc.questionsById?.[op.columnQuestionId] || !columnIds?.includes(op.columnQuestionId)) {
                throw new OperationConflictError(
                    `Question "${op.columnQuestionId}" does not belong to grid "${op.questionId}"`,
                )
            }
            return {
                ...doc,
                questionsById: {
                    ...doc.questionsById,
                    [op.questionId]: {
                        ...gridQuestion,
                        grid: {
                            ...gridQuestion.grid,
                            columnIds: moveInOrder(columnIds, op.columnQuestionId, op.toIndex),
                        },
                    },
                },
            }
        }

        case 'gridColumn.setLayout': {
            const gridQuestion = requireGridQuestion(doc, op.questionId)
            const columnIds = gridQuestion.grid?.columnIds
            if (!doc.questionsById?.[op.columnQuestionId] || !columnIds?.includes(op.columnQuestionId)) {
                throw new OperationConflictError(
                    `Question "${op.columnQuestionId}" does not belong to grid "${op.questionId}"`,
                )
            }

            const presentation = { ...(gridQuestion.presentation ?? {}) }
            const rowEditor = { ...(presentation.rowEditor ?? {}) }
            const layoutByQuestionId = { ...(rowEditor.layoutByQuestionId ?? {}) }
            if (op.placement === null) delete layoutByQuestionId[op.columnQuestionId]
            else layoutByQuestionId[op.columnQuestionId] = op.placement

            if (Object.keys(layoutByQuestionId).length === 0) delete rowEditor.layoutByQuestionId
            else rowEditor.layoutByQuestionId = layoutByQuestionId
            if (Object.keys(rowEditor).length === 0) delete presentation.rowEditor
            else presentation.rowEditor = rowEditor

            const nextQuestion = { ...gridQuestion }
            if (Object.keys(presentation).length === 0) delete nextQuestion.presentation
            else nextQuestion.presentation = presentation
            return {
                ...doc,
                questionsById: {
                    ...doc.questionsById,
                    [op.questionId]: nextQuestion,
                },
            }
        }

        case 'gridRow.create': {
            if (!doc.questionsById?.[op.questionId]) {
                throw new OperationConflictError(`Unknown question "${op.questionId}"`)
            }
            if (doc.gridRowsById?.[op.rowId]) {
                throw new OperationConflictError(`Grid row "${op.rowId}" already exists`)
            }
            const order = doc.gridRowOrderByQuestionId?.[op.questionId] ?? []
            return {
                ...doc,
                gridRowsById: {
                    ...(doc.gridRowsById ?? {}),
                    [op.rowId]: op.label === undefined ? {} : { label: op.label },
                },
                gridRowOrderByQuestionId: {
                    ...(doc.gridRowOrderByQuestionId ?? {}),
                    [op.questionId]: insertAt(order, op.rowId, op.atIndex),
                },
            }
        }

        case 'gridRow.move': {
            const order = doc.gridRowOrderByQuestionId?.[op.questionId]
            if (!order?.includes(op.rowId)) {
                throw new OperationConflictError(`Grid row "${op.rowId}" does not belong to question "${op.questionId}"`)
            }
            // Anchor-relative (OQ-V2-24): a null anchor moves to the front. A move is a
            // remove-then-insert, so the anchor is looked up in the row set that no longer
            // contains the moved row itself.
            const without = order.filter((id) => id !== op.rowId)
            const anchorIndex = op.afterRowId === null ? -1 : without.indexOf(op.afterRowId)
            if (op.afterRowId !== null && anchorIndex === -1) {
                throw new OperationConflictError(`Unknown anchor grid row "${op.afterRowId}"`)
            }
            const at = anchorIndex + 1
            return {
                ...doc,
                gridRowOrderByQuestionId: {
                    ...(doc.gridRowOrderByQuestionId ?? {}),
                    [op.questionId]: [...without.slice(0, at), op.rowId, ...without.slice(at)],
                },
            }
        }

        case 'gridRow.delete': {
            const order = doc.gridRowOrderByQuestionId?.[op.questionId]
            if (!order?.includes(op.rowId)) {
                throw new OperationConflictError(`Grid row "${op.rowId}" does not belong to question "${op.questionId}"`)
            }
            const remaining = order.filter((id) => id !== op.rowId)
            return patchDocument(doc, {
                gridRowsById: doc.gridRowsById && omitKey(doc.gridRowsById, op.rowId),
                gridRowOrderByQuestionId: setOrRemoveOrder(doc.gridRowOrderByQuestionId, op.questionId, remaining),
            })
        }

        case 'gridRow.updateCell': {
            const row = doc.gridRowsById?.[op.rowId]
            if (!row) {
                throw new OperationConflictError(`Unknown grid row "${op.rowId}"`)
            }
            if (!doc.gridRowOrderByQuestionId?.[op.questionId]?.includes(op.rowId)) {
                throw new OperationConflictError(
                    `Grid row "${op.rowId}" does not belong to question "${op.questionId}"`,
                )
            }
            const cells = writeField({ ...(row.cells ?? {}) }, op.columnQuestionId, op.value)
            return {
                ...doc,
                gridRowsById: {
                    ...doc.gridRowsById,
                    [op.rowId]: { ...row, cells: Object.keys(cells).length === 0 ? undefined : cells },
                },
            }
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
            const order = doc.alternativeOrderByQuestionId?.[op.questionId]
            if (!order?.includes(op.alternativeId)) {
                throw new OperationConflictError(
                    `Alternative "${op.alternativeId}" does not belong to question "${op.questionId}"`,
                )
            }
            const remaining = order.filter((id) => id !== op.alternativeId)
            return patchDocument(doc, {
                alternativesById: doc.alternativesById && omitKey(doc.alternativesById, op.alternativeId),
                alternativeOrderByQuestionId: setOrRemoveOrder(
                    doc.alternativeOrderByQuestionId,
                    op.questionId,
                    remaining,
                ),
            })
        }

        case 'tab.create': {
            if (doc.tabsById?.[op.tabId]) {
                throw new OperationConflictError(`Tab "${op.tabId}" already exists`)
            }
            return {
                ...doc,
                tabsById: { ...(doc.tabsById ?? {}), [op.tabId]: op.label === undefined ? {} : { label: op.label } },
                tabOrder: insertAt(doc.tabOrder ?? [], op.tabId, op.atIndex),
            }
        }

        case 'tab.updateField': {
            const tab = doc.tabsById?.[op.tabId]
            if (!tab) {
                throw new OperationConflictError(`Unknown tab "${op.tabId}"`)
            }
            return { ...doc, tabsById: { ...doc.tabsById, [op.tabId]: writeField(tab, op.field, op.value) } }
        }

        case 'tab.move': {
            if (!doc.tabOrder?.includes(op.tabId)) {
                throw new OperationConflictError(`Unknown tab "${op.tabId}"`)
            }
            return { ...doc, tabOrder: moveInOrder(doc.tabOrder, op.tabId, op.toIndex) }
        }

        case 'tab.delete': {
            if (!doc.tabsById?.[op.tabId]) {
                throw new OperationConflictError(`Unknown tab "${op.tabId}"`)
            }
            return patchDocument(doc, {
                tabsById: doc.tabsById && omitKey(doc.tabsById, op.tabId),
                tabOrder: (doc.tabOrder ?? []).filter((id) => id !== op.tabId),
            })
        }

        case 'action.create': {
            if (doc.actionsById?.[op.actionId]) {
                throw new OperationConflictError(`Action "${op.actionId}" already exists`)
            }
            return {
                ...doc,
                actionsById: {
                    ...(doc.actionsById ?? {}),
                    [op.actionId]: op.kind === undefined ? {} : { kind: op.kind },
                },
            }
        }

        case 'action.updateField': {
            const action = doc.actionsById?.[op.actionId]
            if (!action) {
                throw new OperationConflictError(`Unknown action "${op.actionId}"`)
            }
            return { ...doc, actionsById: { ...doc.actionsById, [op.actionId]: writeField(action, op.field, op.value) } }
        }

        case 'action.delete': {
            if (!doc.actionsById?.[op.actionId]) {
                throw new OperationConflictError(`Unknown action "${op.actionId}"`)
            }
            return patchDocument(doc, {
                actionsById: doc.actionsById && omitKey(doc.actionsById, op.actionId),
            })
        }

        case 'dataMapping.create': {
            if (doc.dataMappingsById?.[op.mappingId]) {
                throw new OperationConflictError(`Data mapping "${op.mappingId}" already exists`)
            }
            const root = doc.mappingNodesById?.[op.rootNodeId]
            if (!root) {
                throw new OperationConflictError(`Unknown mapping node "${op.rootNodeId}"`)
            }
            if (root.parentNodeId !== undefined) {
                throw new OperationConflictError(`Mapping root "${op.rootNodeId}" is not a root node — it has a parent`)
            }
            // Adopt the tree's existing bindings into `bindingOrder` — bindings authored before
            // the tree was attached (structure first, §2.2a Gate 2) must not stay unordered.
            const treeNodeIds = collectTreeNodeIds(doc, op.rootNodeId)
            const bindingOrder = Object.entries(doc.mappingBindingsById ?? {})
                .filter(([, binding]) => treeNodeIds.has(binding.nodeId))
                .map(([bindingId]) => bindingId)
            return {
                ...doc,
                dataMappingsById: {
                    ...(doc.dataMappingsById ?? {}),
                    [op.mappingId]: {
                        sourceId: op.sourceId,
                        rootNodeId: op.rootNodeId,
                        ...(bindingOrder.length === 0 ? {} : { bindingOrder }),
                    },
                },
            }
        }

        case 'dataMapping.delete': {
            const mapping = doc.dataMappingsById?.[op.mappingId]
            // An already-gone mapping is a replayed duplicate in the common case — converge
            // silently, the way mappingNode.delete and mappingBinding.delete do.
            if (!mapping) return doc
            // Cascade the whole traversal tree — nodes, their filters and bindings — so an
            // orphaned subtree never remains as dead hash weight. The entry's own
            // `bindingOrder` goes with it, so no order scrub is needed here.
            const treeNodeIds = collectTreeNodeIds(doc, mapping.rootNodeId)
            const filterIds = new Set<string>()
            for (const nodeId of treeNodeIds) {
                for (const filterId of doc.mappingNodesById?.[nodeId]?.filterOrder ?? []) filterIds.add(filterId)
            }
            return patchDocument(doc, {
                dataMappingsById: doc.dataMappingsById && omitKey(doc.dataMappingsById, op.mappingId),
                mappingNodesById:
                    doc.mappingNodesById &&
                    Object.fromEntries(Object.entries(doc.mappingNodesById).filter(([id]) => !treeNodeIds.has(id))),
                mappingFiltersById:
                    doc.mappingFiltersById &&
                    Object.fromEntries(Object.entries(doc.mappingFiltersById).filter(([id]) => !filterIds.has(id))),
                mappingBindingsById:
                    doc.mappingBindingsById &&
                    Object.fromEntries(
                        Object.entries(doc.mappingBindingsById).filter(([, binding]) => !treeNodeIds.has(binding.nodeId)),
                    ),
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

        case 'mappingNode.update': {
            const node = doc.mappingNodesById?.[op.nodeId]
            if (!node) {
                throw new OperationConflictError(`Unknown mapping node "${op.nodeId}"`)
            }
            const next: MappingNode = { ...node }
            if (op.patch.entityId !== undefined) next.entityId = op.patch.entityId
            if (op.patch.parentNodeId !== undefined) {
                if (op.patch.parentNodeId === null) delete next.parentNodeId
                else next.parentNodeId = op.patch.parentNodeId
            }
            if (op.patch.relationshipId !== undefined) {
                if (op.patch.relationshipId === null) delete next.relationshipId
                else next.relationshipId = op.patch.relationshipId
            }
            if (op.patch.filterOrder !== undefined) {
                // An empty order is an explicit unset (DOC-LAW-2 stores no empty array).
                if (op.patch.filterOrder.length === 0) delete next.filterOrder
                else next.filterOrder = op.patch.filterOrder
            }
            return { ...doc, mappingNodesById: { ...doc.mappingNodesById, [op.nodeId]: next } }
        }

        case 'mappingNode.delete': {
            const filterIds = doc.mappingNodesById?.[op.nodeId]?.filterOrder ?? []
            let filtersById = doc.mappingFiltersById
            if (filtersById) {
                filtersById = filterIds.reduce((acc, id) => omitKey(acc, id), filtersById)
            }
            const removedBindingIds = new Set(
                Object.entries(doc.mappingBindingsById ?? {})
                    .filter(([, binding]) => binding.nodeId === op.nodeId)
                    .map(([bindingId]) => bindingId),
            )
            const bindings = Object.entries(doc.mappingBindingsById ?? {}).filter(
                ([, binding]) => binding.nodeId !== op.nodeId,
            )
            const withoutNode = patchDocument(doc, {
                mappingNodesById: doc.mappingNodesById && omitKey(doc.mappingNodesById, op.nodeId),
                mappingFiltersById: filtersById,
                mappingBindingsById: Object.fromEntries(bindings),
            })
            return scrubBindingOrders(withoutNode, removedBindingIds)
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
            const created = {
                ...doc,
                mappingBindingsById: {
                    ...(doc.mappingBindingsById ?? {}),
                    [op.bindingId]: { nodeId: op.nodeId, fieldId: op.fieldId, target: op.target },
                },
            }
            // The owning mapping root's `bindingOrder` lists the new binding — when the tree is
            // attached to one. A binding on a not-yet-attached tree is legal (structure first,
            // mapping afterwards — §2.2a Gate 2), and `dataMapping.create` adopts its bindings'
            // ids when the tree attaches.
            const owner = mappingForNode(created, op.nodeId)
            if (owner === undefined) return created
            const [mappingId, mapping] = owner
            const bindingOrder = mapping.bindingOrder ?? []
            if (bindingOrder.includes(op.bindingId)) return created
            return {
                ...created,
                dataMappingsById: {
                    ...created.dataMappingsById,
                    [mappingId]: { ...mapping, bindingOrder: [...bindingOrder, op.bindingId] },
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
            // A target change must clear the same cardinality check as a create — otherwise an
            // update is a back door around "at most one binding per target" (§2.2a).
            if (op.patch.target !== undefined) {
                const wanted = targetKey(op.patch.target)
                const clash = Object.entries(doc.mappingBindingsById ?? {}).find(
                    ([bindingId, other]) => bindingId !== op.bindingId && targetKey(other.target) === wanted,
                )
                if (clash) {
                    throw new OperationConflictError(
                        `Target ${wanted} is already bound by "${clash[0]}" — at most one binding per target`,
                    )
                }
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
            return scrubBindingOrders(
                patchDocument(doc, {
                    mappingBindingsById: doc.mappingBindingsById && omitKey(doc.mappingBindingsById, op.bindingId),
                }),
                new Set([op.bindingId]),
            )

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
                Object.entries(doc.mappingNodesById ?? {}).map(([nodeId, node]) => {
                    if (!node.filterOrder?.includes(op.filterId)) return [nodeId, node]
                    const filterOrder = node.filterOrder.filter((id) => id !== op.filterId)
                    // DOC-LAW-2: an emptied order array is dropped, never stored as [].
                    const { filterOrder: _removed, ...rest } = node
                    return [nodeId, filterOrder.length === 0 ? rest : { ...node, filterOrder }]
                }),
            )
            return patchDocument(doc, {
                mappingFiltersById: doc.mappingFiltersById && omitKey(doc.mappingFiltersById, op.filterId),
                mappingNodesById: nodes,
            })
        }

        case 'visibilityRule.set': {
            if (!doc.questionsById?.[op.questionId]) {
                throw new OperationConflictError(`Unknown question "${op.questionId}"`)
            }
            const { rulesById, orderByQuestionId } = setScopedRule(
                doc.visibilityRulesById,
                doc.visibilityRuleOrderByQuestionId,
                op.ruleId,
                op.questionId,
                { condition: op.condition },
            )
            return { ...doc, visibilityRulesById: rulesById, visibilityRuleOrderByQuestionId: orderByQuestionId }
        }

        case 'visibilityRule.delete': {
            const { rulesById, orderByQuestionId } = deleteScopedRule(
                doc.visibilityRulesById,
                doc.visibilityRuleOrderByQuestionId,
                op.ruleId,
            )
            return patchDocument(doc, {
                visibilityRulesById: rulesById,
                visibilityRuleOrderByQuestionId: orderByQuestionId,
            })
        }

        case 'highlightRule.set': {
            if (!doc.questionsById?.[op.questionId]) {
                throw new OperationConflictError(`Unknown question "${op.questionId}"`)
            }
            const { rulesById, orderByQuestionId } = setScopedRule(
                doc.highlightRulesById,
                doc.highlightRuleOrderByQuestionId,
                op.ruleId,
                op.questionId,
                { condition: op.condition },
            )
            return { ...doc, highlightRulesById: rulesById, highlightRuleOrderByQuestionId: orderByQuestionId }
        }

        case 'highlightRule.delete': {
            const { rulesById, orderByQuestionId } = deleteScopedRule(
                doc.highlightRulesById,
                doc.highlightRuleOrderByQuestionId,
                op.ruleId,
            )
            return patchDocument(doc, {
                highlightRulesById: rulesById,
                highlightRuleOrderByQuestionId: orderByQuestionId,
            })
        }

        case 'narrativeRule.set': {
            if (!doc.questionsById?.[op.questionId]) {
                throw new OperationConflictError(`Unknown question "${op.questionId}"`)
            }
            const { rulesById, orderByQuestionId } = setScopedRule(
                doc.narrativeRulesById,
                doc.narrativeRuleOrderByQuestionId,
                op.ruleId,
                op.questionId,
                { condition: op.condition },
            )
            return { ...doc, narrativeRulesById: rulesById, narrativeRuleOrderByQuestionId: orderByQuestionId }
        }

        case 'narrativeRule.delete': {
            const { rulesById, orderByQuestionId } = deleteScopedRule(
                doc.narrativeRulesById,
                doc.narrativeRuleOrderByQuestionId,
                op.ruleId,
            )
            return patchDocument(doc, {
                narrativeRulesById: rulesById,
                narrativeRuleOrderByQuestionId: orderByQuestionId,
            })
        }

        case 'qnrRule.set': {
            if (!doc.questionsById?.[op.questionId]) {
                throw new OperationConflictError(`Unknown question "${op.questionId}"`)
            }
            const { rulesById, orderByQuestionId } = setScopedRule(
                doc.qnrRulesById,
                doc.qnrRuleOrderByQuestionId,
                op.ruleId,
                op.questionId,
                { condition: op.condition, templateFamilyId: op.templateFamilyId },
            )
            return { ...doc, qnrRulesById: rulesById, qnrRuleOrderByQuestionId: orderByQuestionId }
        }

        case 'qnrRule.delete': {
            const { rulesById, orderByQuestionId } = deleteScopedRule(
                doc.qnrRulesById,
                doc.qnrRuleOrderByQuestionId,
                op.ruleId,
            )
            return patchDocument(doc, {
                qnrRulesById: rulesById,
                qnrRuleOrderByQuestionId: orderByQuestionId,
            })
        }

        default: {
            // Exhaustiveness: a new op member makes this a compile error, not a silent no-op.
            const unhandled: never = op
            throw new UnknownOperationError((unhandled as { type?: string })?.type ?? 'undefined')
        }
    }
}
