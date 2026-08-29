import type { TemplateOp } from './operations.js'
import type {
    ActionMetadata,
    AlternativeChartLegend,
    BindingCardinality,
    ChartLegend,
    KnownActionKind,
    BindingOnMany,
    BindingOnMissing,
    LayoutPlacement,
    MappingBinding,
    MappingFilter,
    MappingNode,
    QnrAlternative,
    QnrDataMapping,
    QnrAction,
    QnrQuestion,
    QnrTab,
    QnrTemplateDocument,
    QuestionId,
} from './templateDocument.js'
import type { QuestionType } from './questionTypes.js'
import {
    ACTION_TYPES,
    BINDING_OPTION_DEFAULTS,
    MAPPING_FILTER_OPERATORS,
    bindingTargetKey,
    isKnownActionKind,
    makeExpressionAlternativeToken,
    makeExpressionTargetToken,
    parseLegacyBindingOverride,
} from './templateDocument.js'

/** Runtime narrowing for the two closed vocabularies the reducer must re-check on replay. */
const isActionType = (value: unknown): value is (typeof ACTION_TYPES)[number] =>
    typeof value === 'string' && (ACTION_TYPES as readonly string[]).includes(value)

const isDocScalarValue = (value: unknown): value is string | number | boolean =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

/** The behaviour members, so the write loop cannot silently miss one that `BINDING_OPTION_DEFAULTS` gains. */
const BINDING_OPTION_KEYS = Object.keys(BINDING_OPTION_DEFAULTS) as ReadonlyArray<keyof typeof BINDING_OPTION_DEFAULTS>

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

/**
 * Writes a binding's three behaviours in canonical minimal form.
 *
 * Three cases, and the middle one is the reason this is a function rather than a spread:
 * `undefined` leaves the stored value alone (the member was not part of this edit), an explicit
 * `null` unsets it, and **a value equal to the default unsets it too** — DOC-LAW-2 forbids a key
 * present with its own default, so an author choosing `onMany: 'error'` and an author never touching
 * it must produce byte-identical documents. If they did not, the same binding would carry two
 * `document_hash` values depending on which control the author clicked, minting a spurious version
 * and reading as divergence against the imported original.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:195 — DOC-LAW-2
 */
const writeBindingOptions = (
    binding: MappingBinding,
    options: {
        cardinality?: BindingCardinality | null
        onMissing?: BindingOnMissing | null
        onMany?: BindingOnMany | null
    },
): MappingBinding => {
    let next = binding

    for (const key of BINDING_OPTION_KEYS) {
        const chosen = options[key]
        if (chosen === undefined) continue
        next = writeField(next, key, chosen === BINDING_OPTION_DEFAULTS[key] ? null : chosen)
    }

    return next
}

/**
 * Adds, moves or removes ONE member of an ordered primitive id list.
 *
 * The member-wise discipline three ops share, and the reason they are ops at all rather than whole-list
 * writes: JSON Merge Patch replaces an array wholesale, so two authors adding different ids would
 * produce two patches and the second would silently discard the first with no conflict raised. Editing
 * the *current* list one member at a time makes both edits survive — the same argument DOC-LAW-1 makes
 * for keying collections by id.
 *
 * `include: true` inserts at `atIndex` (else appends) and **moves** an id already present when an
 * `atIndex` is supplied; omitting `atIndex` for an id already present is a no-op rather than a
 * duplicate. `include: false` removes it.
 */
const setListMember = (list: readonly string[], id: string, include: boolean, atIndex?: number): string[] => {
    if (!include) return list.filter((member) => member !== id)

    const without = list.filter((member) => member !== id)
    if (atIndex === undefined) return list.includes(id) ? [...list] : [...without, id]

    const at = Math.max(0, Math.min(atIndex, without.length))
    return [...without.slice(0, at), id, ...without.slice(at)]
}

/** Writes a grid question's presentation back in minimal form, dropping every emptied container. */
const writeGridPresentation = (
    doc: QnrTemplateDocument,
    questionId: QuestionId,
    question: QnrQuestion,
    presentation: Record<string, unknown>,
): QnrTemplateDocument => {
    const nextQuestion = { ...question }
    if (Object.keys(presentation).length === 0) delete nextQuestion.presentation
    else nextQuestion.presentation = presentation

    return { ...doc, questionsById: { ...doc.questionsById, [questionId]: nextQuestion } }
}

/** Sets or clears one of a grid presentation's ordered id lists, omitting it when emptied (DOC-LAW-2). */
const writePresentationList = (
    presentation: Record<string, unknown>,
    key: 'filterQuestionIds' | 'actionIds',
    next: readonly string[],
): Record<string, unknown> => {
    const copy = { ...presentation }
    if (next.length === 0) delete copy[key]
    else copy[key] = [...next]
    return copy
}

const presentationListOf = (question: QnrQuestion, key: 'filterQuestionIds' | 'actionIds'): string[] => {
    const value = (question.presentation ?? {})[key]
    return Array.isArray(value) ? (value as string[]).filter((member): member is string => typeof member === 'string') : []
}

/** Every grid presentation that lists `actionId`, so a grid action can have at most one owner. */
const gridsOwningAction = (doc: QnrTemplateDocument, actionId: string): QuestionId[] =>
    Object.entries(doc.questionsById ?? {})
        .filter(([, question]) => presentationListOf(question, 'actionIds').includes(actionId))
        .map(([questionId]) => questionId)

/**
 * The action, if it is a KNOWN one — `kind` inside the closed vocabulary.
 *
 * A legacy record with an unknown `kind` is not "known but unrecognised": the typed ops refuse it
 * outright rather than half-applying rules written for a different shape, which is what keeps old
 * documents replaying byte-identically.
 */
/**
 * Why `field` may not be written as an ordinary tab field edit, or `undefined` if it may.
 *
 * `layout.placementsByQuestionId` is reserved for `tab.setLayout`. Unlike the grid's filter list this
 * one is not even expressible as an `OpValue` — a placement is an object — so the realistic misuse is a
 * write to an ANCESTOR (`layout`, or the placements map cleared wholesale), which would drop every other
 * question's placement in one edit. Both directions of overlap are refused; `label` and any other
 * authored scalar stay ordinary field edits.
 */
/**
 * The tab-owned collections `tab.updateField` may not write, and the operation that owns each.
 *
 * All three are maintained one member at a time. A whole-snapshot write through `updateField` would
 * reintroduce exactly the lost update the member-wise operations exist to prevent: two authors editing
 * different members would produce two full-collection patches and the second would discard the first.
 */
const TAB_OWNED_FIELD_PATHS = [
    ['layout.placementsByQuestionId', 'tab.setLayout'],
    ['questionIds', 'tab.setQuestion'],
    ['rowCountQuestionIds', 'tab.setRowCountQuestion'],
] as const

/**
 * The reserved path `field` would write, if any.
 *
 * Both directions count, as they do for the grid-owned paths: the path itself, a path *below* it
 * (`questionIds.0`), and an *ancestor* whose write would carry the reserved collection with it
 * (`layout`). Checking only exact equality would leave `layout` and `questionIds.0` open, which is a
 * whole-snapshot overwrite by another spelling.
 */
export const tabFieldPathRefusal = (field: string): string | undefined => {
    for (const [reserved, owner] of TAB_OWNED_FIELD_PATHS) {
        if (field === reserved || field.startsWith(`${reserved}.`) || reserved.startsWith(`${field}.`)) {
            return `Field "${field}" writes "${reserved}", which only ${owner} may author`
        }
    }

    return undefined
}

/** One tab-owned primitive id list, defensively filtered: the tab bag is open and may hold anything. */
const tabListOf = (tab: QnrTab, key: 'questionIds' | 'rowCountQuestionIds'): string[] => {
    const value = tab[key]
    return Array.isArray(value) ? value.filter((member): member is string => typeof member === 'string') : []
}

/** Writes one tab-owned list back, omitting it when empty — DOC-LAW-2 admits no stored `[]`. */
const writeTabList = (
    tab: Record<string, unknown>,
    key: 'questionIds' | 'rowCountQuestionIds',
    next: readonly string[],
): Record<string, unknown> => {
    const copy = { ...tab }
    if (next.length === 0) delete copy[key]
    else copy[key] = [...next]
    return copy
}

/** Drops a question from a tab's layout, pruning the emptied placements map and layout object. */
const withoutTabPlacement = (tab: Record<string, unknown>, questionId: QuestionId): Record<string, unknown> => {
    const layout = (tab['layout'] ?? {}) as Record<string, unknown>
    const placements = (layout['placementsByQuestionId'] ?? {}) as Record<string, LayoutPlacement>
    if (placements[questionId] === undefined) return tab

    const nextPlacements = omitKey(placements, questionId)
    const nextLayout = { ...layout }
    if (Object.keys(nextPlacements).length === 0) delete nextLayout['placementsByQuestionId']
    else nextLayout['placementsByQuestionId'] = nextPlacements

    const next = { ...tab }
    if (Object.keys(nextLayout).length === 0) delete next['layout']
    else next['layout'] = nextLayout
    return next
}

/**
 * Validates a `mappingFilter.setTyped` payload in the REDUCER, not only at the wire.
 *
 * The wire schema is the primary gate, but it is not the only path into this reducer: bunjs replays a
 * stored `collab_ops` log without re-validating each op, so an op written by an older or bypassed
 * client arrives here unchecked. Before this, that path accepted an empty `in`, a `range` with no
 * bound, a non-boolean `isNull`, and — worst — an UNKNOWN operator, which fell through the
 * `eq`/`in`/`isNull` tests into the `range` branch and was silently stored as a boundless range.
 * A filter nothing can evaluate then rode into a compiled artifact that is immutable forever.
 *
 * Mirrors the wire schema exactly: closed operator, that operator's members present and correctly
 * typed, and no member belonging to another operator.
 */
const assertTypedFilterPayload = (op: {
    operator: string
    value?: unknown
    values?: unknown
    from?: unknown
    to?: unknown
}): void => {
    if (!(MAPPING_FILTER_OPERATORS as readonly string[]).includes(op.operator)) {
        throw new OperationConflictError(
            `"${op.operator}" is not a typed filter operator (${MAPPING_FILTER_OPERATORS.join(' | ')}); use mappingFilter.set for a legacy operator`,
        )
    }

    // Stale members first: a payload carrying another operator's members is ambiguous whatever else is
    // right about it, and the canonical replace would silently drop them rather than refuse.
    const present = (['value', 'values', 'from', 'to'] as const).filter((member) => op[member] !== undefined)
    const allowed: Record<string, readonly string[]> = {
        eq: ['value'],
        in: ['values'],
        range: ['from', 'to'],
        isNull: ['value'],
    }
    const stale = present.filter((member) => !(allowed[op.operator] ?? []).includes(member))
    if (stale.length > 0) {
        throw new OperationConflictError(`Operator "${op.operator}" does not carry ${stale.join(', ')}`)
    }

    if (op.operator === 'eq') {
        if (!isDocScalarValue(op.value)) throw new OperationConflictError('Operator "eq" requires a scalar value')
        return
    }

    if (op.operator === 'isNull') {
        if (typeof op.value !== 'boolean') {
            throw new OperationConflictError('Operator "isNull" requires a boolean value')
        }
        return
    }

    if (op.operator === 'in') {
        if (!Array.isArray(op.values) || op.values.length === 0) {
            throw new OperationConflictError('Operator "in" requires a non-empty list')
        }
        if (!op.values.every(isDocScalarValue)) {
            throw new OperationConflictError('Operator "in" requires every member to be a scalar')
        }
        return
    }

    // range: at least one bound, and every bound present must be a scalar.
    if (op.from === undefined && op.to === undefined) {
        throw new OperationConflictError('Operator "range" requires at least one of "from"/"to"')
    }
    for (const bound of ['from', 'to'] as const) {
        if (op[bound] !== undefined && !isDocScalarValue(op[bound])) {
            throw new OperationConflictError(`Operator "range" requires "${bound}" to be a scalar`)
        }
    }
}

/** UI edit buffers, in both spellings. Rejected on known kinds by the whitelist below. */
const ACTION_UI_BUFFERS = ['editableLabel', 'editableType', 'editable_label', 'editable_type'] as const

/**
 * The ONLY fields `action.updateField` may write on a KNOWN action: `label` on either kind, and
 * `actionType` on a `gridAction`.
 *
 * **A whitelist, not a blacklist, and that is the repair.** The first version enumerated what was
 * forbidden — `kind`, the UI buffers, the two keyed collections — which meant `arbitraryField` and every
 * other unlisted name sailed through and persisted. A known action's shape is closed by definition, so
 * the safe default is refusal: anything not named here is not part of the typed vocabulary, and
 * admitting it would turn a typed record back into the broad legacy bag the closed kinds exist to
 * replace. `QnrAction` stays open for LEGACY records precisely so this can be strict.
 *
 * The listed names still carry their own reasons for being writable or not:
 *
 * - **`kind` is write-once.** It selects which rules apply, so changing it reinterprets every member
 *   already stored under the old kind.
 * - **UI edit buffers are not document content** (`editable_label`/`editable_type`), so authoring them
 *   would mint a version for a designer-side checkbox.
 * - **The two keyed collections are reserved** for `action.setGridActionRef` / `action.setMetadata`,
 *   which edit them one member at a time; a field write replaces a map wholesale.
 */
const KNOWN_ACTION_WRITABLE_FIELDS: Readonly<Record<KnownActionKind, readonly string[]>> = {
    topLevelAction: ['label'],
    gridAction: ['label', 'actionType'],
}

/** The collections only the typed member-wise ops may author — named for the refusal message. */
const ACTION_OWNED_FIELD_PATHS = ['actionIdsByGridQuestionId', 'metadataByQuestionId'] as const

/**
 * Why `field` may not be written on a KNOWN action, or `undefined` if it may.
 *
 * Applies to known kinds only: a legacy record keeps taking any field, buffers included, because that
 * is what makes an already-stored action replay byte-identically (ADR-0008 DEC-006).
 */
export const knownActionFieldRefusal = (kind: KnownActionKind, field: string): string | undefined => {
    const writable = KNOWN_ACTION_WRITABLE_FIELDS[kind]
    if (writable.includes(field)) return undefined

    // The specific messages first, so the reason a caller reads names their actual mistake rather than
    // "not writable" for a field that is writable on the other kind, or reserved for a dedicated op.
    if (field === 'kind' || field.startsWith('kind.')) {
        return 'Field "kind" is write-once on a known action; create a new action instead'
    }
    if (ACTION_UI_BUFFERS.some((buffer) => field === buffer || field.startsWith(`${buffer}.`))) {
        return `Field "${field}" is a UI edit buffer, not document content`
    }
    if (field === 'actionType' || field.startsWith('actionType.')) {
        return `Field "actionType" belongs to a gridAction, not a ${kind}`
    }
    const owned = ACTION_OWNED_FIELD_PATHS.find(
        (path) => field === path || field.startsWith(`${path}.`) || path.startsWith(`${field}.`),
    )
    if (owned !== undefined) {
        return `Field "${field}" writes "${owned}", which only the typed action operations may author`
    }

    return `Field "${field}" is not part of the ${kind} vocabulary (writable: ${writable.join(', ')})`
}

/**
 * Why `value` may not be written to a permitted known-action field, or `undefined` if it may.
 *
 * The whitelist alone would still let `actionType: 'DELETE'` or a numeric `label` through, turning a
 * typed record into a malformed one that every downstream reader has to re-check. `null` is the explicit
 * unset the op layer carries, so it is legal for both.
 */
export const knownActionValueRefusal = (field: string, value: unknown): string | undefined => {
    if (value === null) return undefined

    if (field === 'label' && typeof value !== 'string') {
        return `Field "label" takes a string, not ${typeof value}`
    }
    if (field === 'actionType' && !isActionType(value)) {
        return `"${String(value)}" is not a valid actionType (${ACTION_TYPES.join(' | ')})`
    }

    return undefined
}

const requireKnownAction = (doc: QnrTemplateDocument, actionId: string, kind: 'topLevelAction' | 'gridAction'): QnrAction => {
    const action = doc.actionsById?.[actionId]
    if (!action) throw new OperationConflictError(`Unknown action "${actionId}"`)
    if (!isKnownActionKind(action.kind)) {
        throw new OperationConflictError(
            `Action "${actionId}" is a legacy record (kind "${String(action.kind)}"); the typed operations only author known kinds`,
        )
    }
    if (action.kind !== kind) {
        throw new OperationConflictError(`Action "${actionId}" is a ${action.kind}, not a ${kind}`)
    }
    return action
}

/**
 * Canonicalizes one metadata entry, refusing the two shapes DOC-LAW-2 makes ambiguous.
 *
 * `{all: true}` is the all-to-all marker and is exclusive with bounds: legacy writes all-to-all as
 * `from: null, to: null`, and since a document may carry neither a null nor an empty object, "selected
 * but unbounded" and "not selected" would otherwise be the same absence.
 */
const canonicalActionMetadata = (metadata: ActionMetadata): ActionMetadata => {
    const record = metadata as Record<string, unknown>
    const hasAll = record['all'] === true
    const hasFrom = record['from'] !== undefined
    const hasTo = record['to'] !== undefined

    if (hasAll && (hasFrom || hasTo)) {
        throw new OperationConflictError('Action metadata "all" is exclusive with "from"/"to"')
    }
    if (hasAll) return { all: true }
    if (!hasFrom && !hasTo) {
        throw new OperationConflictError('Action metadata must select something: "all", "from" and/or "to"')
    }

    return {
        ...(hasFrom ? { from: record['from'] as never } : {}),
        ...(hasTo ? { to: record['to'] as never } : {}),
    } as ActionMetadata
}

/**
 * Drops every top-level reference to one of a grid's actions.
 *
 * A `topLevelAction` entry means "run this GRID's action", so when the grid stops owning the action the
 * reference stops being expressible at the same moment — leaving it would compile into a button that
 * runs nothing. Emptied sequences drop their grid key and an emptied map is omitted (DOC-LAW-2).
 */
const scrubGridActionRefs = (
    doc: QnrTemplateDocument,
    gridQuestionId: QuestionId,
    gridActionId: string,
): QnrTemplateDocument => {
    const actions = Object.entries(doc.actionsById ?? {})
    if (actions.length === 0) return doc

    let changed = false
    const nextActions = Object.fromEntries(
        actions.map(([actionId, action]) => {
            const byGrid = (action['actionIdsByGridQuestionId'] ?? {}) as Record<string, string[]>
            const sequence = byGrid[gridQuestionId]
            if (!Array.isArray(sequence) || !sequence.includes(gridActionId)) return [actionId, action]

            changed = true
            const remaining = sequence.filter((id) => id !== gridActionId)
            const nextByGrid = { ...byGrid }
            if (remaining.length === 0) delete nextByGrid[gridQuestionId]
            else nextByGrid[gridQuestionId] = remaining

            const nextAction = { ...action }
            if (Object.keys(nextByGrid).length === 0) delete nextAction['actionIdsByGridQuestionId']
            else nextAction['actionIdsByGridQuestionId'] = nextByGrid
            return [actionId, nextAction]
        }),
    )

    return changed ? { ...doc, actionsById: nextActions } : doc
}

/** Drops a deleted question's placement from every tab layout, and every emptied container with it. */
const scrubTabQuestionRefs = (doc: QnrTemplateDocument, questionId: QuestionId): QnrTemplateDocument => {
    const tabs = Object.entries(doc.tabsById ?? {})
    if (tabs.length === 0) return doc

    let changed = false
    const nextTabs = Object.fromEntries(
        tabs.map(([tabId, tab]) => {
            const members = tabListOf(tab, 'questionIds')
            const counted = tabListOf(tab, 'rowCountQuestionIds')
            const layout = (tab.layout ?? {}) as Record<string, unknown>
            const placements = (layout['placementsByQuestionId'] ?? {}) as Record<string, LayoutPlacement>

            const inMembers = members.includes(questionId)
            const inCounted = counted.includes(questionId)
            const inLayout = placements[questionId] !== undefined
            if (!inMembers && !inCounted && !inLayout) return [tabId, tab]

            changed = true
            let next: Record<string, unknown> = { ...tab }
            if (inMembers) next = writeTabList(next, 'questionIds', members.filter((id) => id !== questionId))
            if (inCounted) {
                next = writeTabList(next, 'rowCountQuestionIds', counted.filter((id) => id !== questionId))
            }
            if (inLayout) next = withoutTabPlacement(next, questionId)
            return [tabId, next as QnrTab]
        }),
    )

    return changed ? { ...doc, tabsById: nextTabs } : doc
}

/**
 * The question types that may be an Expression/Chart target: they carry alternatives to score, plus
 * `LinearScale`, whose numeric range legacy also admits.
 *
 * `Chart` is excluded even though it carries alternatives — a chart scoring a chart is the cycle legacy
 * never allowed.
 *
 * **A deliberately explicit opt-in literal, not derived from anything.** There is no selectable-type
 * register in `questionTypes.ts` to derive it from, and inventing one would make targetability a
 * side-effect of how a type is classified elsewhere. Adding a question type must be a decision taken
 * here, in this list.
 *
 * `satisfies readonly QuestionType[]` is what stops that literal from rotting: a typo'd or removed
 * question type fails `ts:check` instead of becoming silently dead code that refuses a legitimate
 * target forever. The membership itself — which six types, and no others — is pinned in both directions
 * by a table-driven test, because the type system cannot tell a deliberate list from a wrong one.
 */
const EXPRESSION_TARGET_TYPES = [
    'BooleanQuestion',
    'CheckBoxes',
    'Dropdown',
    'Emoticons',
    'LinearScale',
    'RadioButtons',
] as const satisfies readonly QuestionType[]

/**
 * Whether one question may be cited as an Expression target or a Chart assignment target.
 *
 * `flags.is_expression` must be explicitly `true`. The flags bag is open, so a merely *present* flag is
 * not enough: a question carrying `is_expression: 'no'` or an imported non-boolean would otherwise pass.
 */
const isExpressionTarget = (question: QnrQuestion | undefined): boolean => {
    if (!question) return false
    if (!(EXPRESSION_TARGET_TYPES as readonly string[]).includes(question.type)) return false
    const flags = question['flags']
    if (typeof flags !== 'object' || flags === null || Array.isArray(flags)) return false
    return (flags as Record<string, unknown>)['is_expression'] === true
}

/** A question of the required type, or a refusal naming what was wrong. */
const requireQuestionOfType = (doc: QnrTemplateDocument, questionId: QuestionId, type: string): QnrQuestion => {
    const question = doc.questionsById?.[questionId]
    if (!question) throw new OperationConflictError(`Unknown question "${questionId}"`)
    if (question.type !== type) {
        throw new OperationConflictError(`Question "${questionId}" is not a ${type}`)
    }
    return question
}

/** Refuses unless the alternative is in that exact question's order — ownership, not mere existence. */
const requireOwnedAlternative = (
    doc: QnrTemplateDocument,
    questionId: QuestionId,
    alternativeId: string,
): QnrAlternative => {
    if (!doc.alternativeOrderByQuestionId?.[questionId]?.includes(alternativeId)) {
        throw new OperationConflictError(
            `Alternative "${alternativeId}" does not belong to question "${questionId}"`,
        )
    }
    return doc.alternativesById?.[alternativeId] ?? {}
}

/** One Chart question's legend record and order, defensively read out of the open `chart` bag. */
const chartOf = (question: QnrQuestion): { chart: Record<string, unknown>; legendsById: Record<string, ChartLegend>; order: string[] } => {
    const chart = (question['chart'] ?? {}) as Record<string, unknown>
    const legendsById = (chart['legendsById'] ?? {}) as Record<string, ChartLegend>
    const rawOrder = chart['legendsOrder']
    const order = Array.isArray(rawOrder) ? rawOrder.filter((id): id is string => typeof id === 'string') : []
    return { chart, legendsById, order }
}

/** Writes a Chart bag back onto its question, pruning emptied containers without deleting the question. */
const writeChart = (
    doc: QnrTemplateDocument,
    questionId: QuestionId,
    question: QnrQuestion,
    chart: Record<string, unknown>,
): QnrTemplateDocument => {
    const next: Record<string, unknown> = { ...question }
    if (Object.keys(chart).length === 0) delete next['chart']
    else next['chart'] = chart
    return { ...doc, questionsById: { ...doc.questionsById, [questionId]: next as QnrQuestion } }
}

/**
 * Removes one alternative's exact canonical `<exp_...>` token from its owning question's base formula.
 *
 * Scoped to the owner and to the canonical spelling on purpose: a substring scan would corrupt author
 * text, and rewriting another question's formula would be an edit no operation asked for.
 */
const withoutExpressionAlternativeToken = (
    doc: QnrTemplateDocument,
    questionId: QuestionId,
    alternativeId: string,
): QnrTemplateDocument => {
    const question = doc.questionsById?.[questionId]
    const expression = question?.['expression']
    if (typeof expression !== 'object' || expression === null || Array.isArray(expression)) return doc

    const base = (expression as Record<string, unknown>)['base']
    const token = makeExpressionAlternativeToken(alternativeId)
    if (typeof base !== 'string' || !base.includes(token)) return doc

    const nextBase = base.split(token).join('')
    const nextExpression = { ...(expression as Record<string, unknown>) }
    if (nextBase === '') delete nextExpression['base']
    else nextExpression['base'] = nextBase

    const nextQuestion: Record<string, unknown> = { ...question }
    if (Object.keys(nextExpression).length === 0) delete nextQuestion['expression']
    else nextQuestion['expression'] = nextExpression

    return {
        ...doc,
        questionsById: { ...doc.questionsById, [questionId]: nextQuestion as QnrQuestion },
    }
}

/** One question's canonical `expressionTargets` list, defensively filtered — the bag is open. */
const expressionTargetsOf = (alternative: QnrAlternative): string[] => {
    const value = alternative['expressionTargets']
    return Array.isArray(value) ? value.filter((member): member is string => typeof member === 'string') : []
}

/**
 * Drops a deleted question from every canonical Expression target list and Chart assignment.
 *
 * Three edits on one alternative, all keyed on the **exact canonical** form:
 *   - the id leaves `expressionTargets`;
 *   - its canonical `<target_...>` token in `value` becomes `0`, so the formula still parses as
 *     arithmetic instead of carrying a reference to a question that no longer exists;
 *   - a `chartLegend` whose `questionIdMap` cites it is cleared whole.
 *
 * **Exact token replacement, never substring matching.** A legacy formula holds truncated
 * last-eight-character tokens and arbitrary author text; scanning for a fragment would rewrite text
 * this reducer has no claim on. Only the full canonical token is replaced, which is why it is generated
 * here from the same constructor the authoring path uses rather than pattern-matched.
 */
const scrubExpressionAndChartRefs = (doc: QnrTemplateDocument, questionId: QuestionId): QnrTemplateDocument => {
    const alternatives = Object.entries(doc.alternativesById ?? {})
    if (alternatives.length === 0) return doc

    const token = makeExpressionTargetToken(questionId)
    let changed = false

    const nextAlternatives = Object.fromEntries(
        alternatives.map(([alternativeId, alternative]) => {
            const targets = expressionTargetsOf(alternative)
            const hasTarget = targets.includes(questionId)
            const formula = alternative['value']
            const hasToken = typeof formula === 'string' && formula.includes(token)
            const assignment = alternative['chartLegend']
            const hasAssignment =
                typeof assignment === 'object' &&
                assignment !== null &&
                !Array.isArray(assignment) &&
                (assignment as Record<string, unknown>)['questionIdMap'] === questionId

            if (!hasTarget && !hasToken && !hasAssignment) return [alternativeId, alternative]

            changed = true
            const next: Record<string, unknown> = { ...alternative }
            if (hasTarget) {
                const remaining = targets.filter((id) => id !== questionId)
                if (remaining.length === 0) delete next['expressionTargets']
                else next['expressionTargets'] = remaining
            }
            // `split`/`join` replaces every occurrence: one formula may cite the same target twice.
            if (hasToken) next['value'] = (formula as string).split(token).join('0')
            if (hasAssignment) delete next['chartLegend']
            return [alternativeId, next as QnrAlternative]
        }),
    )

    return changed ? { ...doc, alternativesById: nextAlternatives } : doc
}

/** Drops a deleted tab from every grid that named it as its header. */
const scrubHeaderTabRefs = (doc: QnrTemplateDocument, tabId: string): QnrTemplateDocument => {
    const questions = Object.entries(doc.questionsById ?? {})
    let changed = false
    const nextQuestions = Object.fromEntries(
        questions.map(([questionId, question]) => {
            if (question.presentation?.headerTabId !== tabId) return [questionId, question]

            changed = true
            const presentation = { ...question.presentation }
            delete presentation.headerTabId
            const nextQuestion = { ...question }
            if (Object.keys(presentation).length === 0) delete nextQuestion.presentation
            else nextQuestion.presentation = presentation
            return [questionId, nextQuestion]
        }),
    )

    return changed ? { ...doc, questionsById: nextQuestions } : doc
}

/** Drops a deleted action from every grid presentation and every top-level sequence naming it. */
const scrubActionRefs = (doc: QnrTemplateDocument, actionId: string): QnrTemplateDocument => {
    let next = doc

    for (const gridQuestionId of gridsOwningAction(doc, actionId)) {
        const grid = next.questionsById?.[gridQuestionId]
        if (!grid) continue
        const presentation = writePresentationList(
            { ...(grid.presentation ?? {}) },
            'actionIds',
            presentationListOf(grid, 'actionIds').filter((id) => id !== actionId),
        )
        next = writeGridPresentation(next, gridQuestionId, grid, presentation)
        next = scrubGridActionRefs(next, gridQuestionId, actionId)
    }

    // A top-level action can also be deleted while still referenced by nothing of its own; and a grid
    // action may be referenced under a grid that no longer owns it, so sweep every sequence by value.
    const actions = Object.entries(next.actionsById ?? {})
    let changed = false
    const nextActions = Object.fromEntries(
        actions.map(([id, action]) => {
            const byGrid = (action['actionIdsByGridQuestionId'] ?? {}) as Record<string, string[]>
            const entries = Object.entries(byGrid)
            if (entries.length === 0) return [id, action]

            const rebuilt = entries
                .map(([gridId, sequence]) => [gridId, sequence.filter((member) => member !== actionId)] as const)
                .filter(([, sequence]) => sequence.length > 0)
            if (rebuilt.length === entries.length && rebuilt.every(([, seq], index) => seq.length === (entries[index]?.[1].length ?? 0))) {
                return [id, action]
            }

            changed = true
            const nextAction = { ...action }
            if (rebuilt.length === 0) delete nextAction['actionIdsByGridQuestionId']
            else nextAction['actionIdsByGridQuestionId'] = Object.fromEntries(rebuilt.map(([g, seq]) => [g, [...seq]]))
            return [id, nextAction]
        }),
    )

    return changed ? { ...next, actionsById: nextActions } : next
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
const GRID_OWNED_FIELD_PATHS = [
    'grid.columnIds',
    'presentation.rowEditor.layoutByQuestionId',
    // Maintained member-wise by `gridColumn.setFilter` / `gridColumn.setAction`. An `OpValue` can carry
    // a primitive array, so unlike the layout map these two are *expressible* as a field edit — which is
    // exactly why they must be reserved: a wholesale write is the lost-update the member-wise ops exist
    // to prevent, and it would land silently.
    'presentation.filterQuestionIds',
    'presentation.actionIds',
] as const

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
    'prefillRulesById',
    'prefillRuleOrderByQuestionId',
    'highlightRuleSettingsByQuestionId',
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
    // Prefill rules are keyed by their TARGET question — the one that gets filled — so deleting a
    // question takes the rules that fill IT, exactly as the four families above take their owner's.
    // A rule on a SURVIVING question that names this one as its `sourceQuestionId` is deliberately
    // KEPT and left dangling, for the reason stated above: dropping a surviving question's authored
    // rule is data loss, and a dangling reference is for validation to surface, not for the reducer
    // to silently resolve.
    const prefillRuleIds = doc.prefillRuleOrderByQuestionId?.[questionId] ?? []
    let prefillRulesById = doc.prefillRulesById
    if (prefillRulesById) {
        prefillRulesById = prefillRuleIds.reduce((acc, id) => omitKey(acc, id), prefillRulesById)
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
        prefillRulesById,
        prefillRuleOrderByQuestionId:
            doc.prefillRuleOrderByQuestionId && omitKey(doc.prefillRuleOrderByQuestionId, questionId),
        // The settings ride with the question they configure; an entry no question reaches is
        // unreachable state that still changes `document_hash`.
        highlightRuleSettingsByQuestionId:
            doc.highlightRuleSettingsByQuestionId && omitKey(doc.highlightRuleSettingsByQuestionId, questionId),
    })
    // A binding pointing at a deleted question is an unresolvable reference the
    // compiler would reject at publication; drop it with its target. A grid column
    // list pointing at it is the same class of reference and goes the same way — and so are the
    // presentation references a column earns: its filter chip, its row-editor placement, its default
    // width, and its placement inside any tab's positional grid.
    const withoutRefs = dropBindingsForQuestion(dropFromGridColumns(withoutQuestion, questionId), questionId)
    return scrubExpressionAndChartRefs(
        scrubTabQuestionRefs(scrubColumnPresentationRefs(withoutRefs, questionId), questionId),
        questionId,
    )
}

/**
 * Drops a deleted column from every grid presentation that referenced it.
 *
 * `dropFromGridColumns` removes the ownership entry; these are the three places a column also earns a
 * reference — the filter selection, its row-editor placement and its authored default width. Left
 * behind, each is a key naming a question the document no longer has: unreachable state that still
 * changes `document_hash`, which is what makes it a correctness problem and not tidiness.
 */
const scrubColumnPresentationRefs = (doc: QnrTemplateDocument, questionId: QuestionId): QnrTemplateDocument => {
    const questions = Object.entries(doc.questionsById ?? {})
    let changed = false

    const nextQuestions = Object.fromEntries(
        questions.map(([gridQuestionId, question]) => {
            const presentation = question.presentation
            if (presentation === undefined) return [gridQuestionId, question]

            let next: Record<string, unknown> = { ...presentation }
            let touched = false

            const filters = presentationListOf(question, 'filterQuestionIds')
            if (filters.includes(questionId)) {
                next = writePresentationList(next, 'filterQuestionIds', filters.filter((id) => id !== questionId))
                touched = true
            }

            const rowEditor = next['rowEditor'] as { layoutByQuestionId?: Record<string, unknown> } | undefined
            if (rowEditor?.layoutByQuestionId?.[questionId] !== undefined) {
                const layout = omitKey(rowEditor.layoutByQuestionId, questionId)
                const nextRowEditor: Record<string, unknown> = { ...rowEditor }
                if (Object.keys(layout).length === 0) delete nextRowEditor['layoutByQuestionId']
                else nextRowEditor['layoutByQuestionId'] = layout
                if (Object.keys(nextRowEditor).length === 0) delete next['rowEditor']
                else next['rowEditor'] = nextRowEditor
                touched = true
            }

            const widths = next['defaultColumnWidthsByQuestionId'] as Record<string, number> | undefined
            if (widths?.[questionId] !== undefined) {
                const remaining = omitKey(widths, questionId)
                if (Object.keys(remaining).length === 0) delete next['defaultColumnWidthsByQuestionId']
                else next['defaultColumnWidthsByQuestionId'] = remaining
                touched = true
            }

            if (!touched) return [gridQuestionId, question]
            changed = true

            const nextQuestion = { ...question }
            if (Object.keys(next).length === 0) delete nextQuestion.presentation
            else nextQuestion.presentation = next
            return [gridQuestionId, nextQuestion]
        }),
    )

    return changed ? { ...doc, questionsById: nextQuestions } : doc
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

        case 'gridColumn.setFilter': {
            const gridQuestion = requireGridQuestion(doc, op.questionId)
            const columnIds = gridQuestion.grid?.columnIds
            // Only a column this grid owns may offer a filter: a top-level question's filter chip would
            // have no row context to filter, and the reference would dangle on the grid's delete.
            if (!doc.questionsById?.[op.columnQuestionId] || !columnIds?.includes(op.columnQuestionId)) {
                throw new OperationConflictError(
                    `Question "${op.columnQuestionId}" does not belong to grid "${op.questionId}"`,
                )
            }

            const presentation = writePresentationList(
                { ...(gridQuestion.presentation ?? {}) },
                'filterQuestionIds',
                setListMember(presentationListOf(gridQuestion, 'filterQuestionIds'), op.columnQuestionId, op.include, op.atIndex),
            )
            return writeGridPresentation(doc, op.questionId, gridQuestion, presentation)
        }

        case 'gridColumn.setAction': {
            const gridQuestion = requireGridQuestion(doc, op.questionId)
            if (op.include) {
                // A grid may only own a KNOWN gridAction. A `topLevelAction` here would be owned by the
                // very grid it is supposed to drive, and an unknown legacy record has no `actionType`
                // vocabulary at all — either way the reference compiles into nothing. `include: false`
                // deliberately skips this so a malformed or legacy reference can still be scrubbed.
                requireKnownAction(doc, op.actionId, 'gridAction')
                // A grid action has at most one owning grid, which is what makes its metadata scope
                // unambiguous — the same action listed by two grids would have two column vocabularies.
                const owners = gridsOwningAction(doc, op.actionId).filter((owner) => owner !== op.questionId)
                if (owners.length > 0) {
                    throw new OperationConflictError(
                        `Action "${op.actionId}" is already owned by grid "${owners[0]}"`,
                    )
                }
            }

            const presentation = writePresentationList(
                { ...(gridQuestion.presentation ?? {}) },
                'actionIds',
                setListMember(presentationListOf(gridQuestion, 'actionIds'), op.actionId, op.include, op.atIndex),
            )
            const next = writeGridPresentation(doc, op.questionId, gridQuestion, presentation)

            // Removing a grid's action also drops it from every top-level sequence for THAT grid: the
            // reference means "run this grid's action", so it stops being expressible at the same moment.
            return op.include ? next : scrubGridActionRefs(next, op.questionId, op.actionId)
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
            const withoutAlternative = patchDocument(doc, {
                alternativesById: doc.alternativesById && omitKey(doc.alternativesById, op.alternativeId),
                alternativeOrderByQuestionId: setOrRemoveOrder(
                    doc.alternativeOrderByQuestionId,
                    op.questionId,
                    remaining,
                ),
            })
            // An ExpressionQuestion's `expression.base` cites its alternatives by canonical token. The
            // token must go with the alternative, and only from THIS question's formula: another
            // question's text is not this operation's to rewrite, and a legacy truncated token is not
            // canonical so it is deliberately left alone for publication to report.
            return withoutExpressionAlternativeToken(withoutAlternative, op.questionId, op.alternativeId)
        }

        case 'alternative.setExpressionFormula': {
            requireQuestionOfType(doc, op.questionId, 'ExpressionQuestion')
            const alternative = requireOwnedAlternative(doc, op.questionId, op.alternativeId)

            // Duplicates first: the list is an ordered set, and a repeated target would make one
            // question contribute twice to a formula that names it once.
            const seen = new Set<string>()
            for (const targetId of op.expressionTargets) {
                if (seen.has(targetId)) {
                    throw new OperationConflictError(`Expression target "${targetId}" is listed twice`)
                }
                seen.add(targetId)
                if (!doc.questionsById?.[targetId]) {
                    throw new OperationConflictError(`Unknown question "${targetId}"`)
                }
                if (!isExpressionTarget(doc.questionsById[targetId])) {
                    throw new OperationConflictError(
                        `Question "${targetId}" is not a selectable or LinearScale question with flags.is_expression`,
                    )
                }
            }

            // Formula text and target list land together. The two are NOT cross-checked: a partially
            // typed formula must save, so a token with no target and a target with no token are both
            // legal drafts that publication reports rather than the reducer refusing.
            const next: Record<string, unknown> = { ...alternative, value: op.value }
            if (op.expressionTargets.length === 0) delete next['expressionTargets']
            else next['expressionTargets'] = [...op.expressionTargets]

            return {
                ...doc,
                alternativesById: { ...doc.alternativesById, [op.alternativeId]: next as QnrAlternative },
            }
        }

        case 'alternative.setChartLegend': {
            const question = requireQuestionOfType(doc, op.questionId, 'Chart')
            const alternative = requireOwnedAlternative(doc, op.questionId, op.alternativeId)

            if (op.chartLegend === null) {
                // Clearing needs no valid stored value: that is what makes it able to repair an imported
                // dangling or non-radar assignment.
                if (alternative['chartLegend'] === undefined) return doc
                const cleared: Record<string, unknown> = { ...alternative }
                delete cleared['chartLegend']
                return {
                    ...doc,
                    alternativesById: { ...doc.alternativesById, [op.alternativeId]: cleared as QnrAlternative },
                }
            }

            // Authoring a new assignment requires the canonical subtype; a stored `pie` or unknown type
            // stays readable and clearable but never becomes writable through the typed path.
            const { legendsById } = chartOf(question)
            if (question['chart'] === undefined || (question['chart'] as Record<string, unknown>)['type'] !== 'radar') {
                throw new OperationConflictError(`Question "${op.questionId}" is not a radar chart`)
            }
            const legend = legendsById[op.chartLegend.id]
            if (!legend) {
                throw new OperationConflictError(
                    `Unknown chart legend "${op.chartLegend.id}" on question "${op.questionId}"`,
                )
            }
            const target = doc.questionsById?.[op.chartLegend.questionIdMap]
            if (!target) {
                throw new OperationConflictError(`Unknown question "${op.chartLegend.questionIdMap}"`)
            }
            if (!isExpressionTarget(target)) {
                throw new OperationConflictError(
                    `Question "${op.chartLegend.questionIdMap}" is not a selectable or LinearScale question with flags.is_expression`,
                )
            }

            // One write of the whole value, with `label` derived here rather than taken from the client:
            // a client label would let one legend id carry two labels, i.e. two hashes for one state.
            const assignment: AlternativeChartLegend = {
                id: op.chartLegend.id,
                questionIdMap: op.chartLegend.questionIdMap,
                label: legend.label,
            }
            return {
                ...doc,
                alternativesById: {
                    ...doc.alternativesById,
                    [op.alternativeId]: { ...alternative, chartLegend: assignment } as QnrAlternative,
                },
            }
        }

        case 'chartLegend.create': {
            const question = requireQuestionOfType(doc, op.questionId, 'Chart')
            if (op.legendId === '') throw new OperationConflictError('A chart legend id may not be empty')
            if (op.label === '') throw new OperationConflictError('A chart legend label may not be empty')

            const { chart, legendsById, order } = chartOf(question)
            // Creation is the one Chart operation that requires the canonical subtype: deletion and
            // clearing must stay available to repair imported `pie`/unknown content.
            if (chart['type'] !== 'radar') {
                throw new OperationConflictError(`Question "${op.questionId}" is not a radar chart`)
            }
            if (legendsById[op.legendId] !== undefined) {
                throw new OperationConflictError(`Chart legend "${op.legendId}" already exists`)
            }
            // Legacy compares labels by exact equality, and two legends with one label are
            // indistinguishable in the radar the author is looking at.
            if (Object.values(legendsById).some((existing) => existing.label === op.label)) {
                throw new OperationConflictError(`Chart legend label "${op.label}" is already used`)
            }

            // Record and order in one write: a record with no order entry is unreachable state that
            // still moves the hash, and an order entry with no record dangles.
            const nextChart: Record<string, unknown> = {
                ...chart,
                legendsById: { ...legendsById, [op.legendId]: { id: op.legendId, label: op.label } },
                legendsOrder: insertAt(order, op.legendId, op.atIndex),
            }
            return writeChart(doc, op.questionId, question, nextChart)
        }

        case 'chartLegend.delete': {
            const question = requireQuestionOfType(doc, op.questionId, 'Chart')
            const { chart, legendsById, order } = chartOf(question)
            if (legendsById[op.legendId] === undefined) {
                throw new OperationConflictError(
                    `Unknown chart legend "${op.legendId}" on question "${op.questionId}"`,
                )
            }

            const remainingLegends = omitKey(legendsById, op.legendId)
            const remainingOrder = order.filter((id) => id !== op.legendId)
            const nextChart: Record<string, unknown> = { ...chart }
            if (Object.keys(remainingLegends).length === 0) delete nextChart['legendsById']
            else nextChart['legendsById'] = remainingLegends
            if (remainingOrder.length === 0) delete nextChart['legendsOrder']
            else nextChart['legendsOrder'] = remainingOrder

            const withoutLegend = writeChart(doc, op.questionId, question, nextChart)

            // The cascade matches the legacy effect: a legend that disappears stops appearing on
            // alternatives. Scoped to THIS Chart's own alternatives — an identical legend id on another
            // question is a different legend, and imported ids do collide across questions.
            const ownedAlternativeIds = withoutLegend.alternativeOrderByQuestionId?.[op.questionId] ?? []
            let alternativesById = withoutLegend.alternativesById
            let changed = false
            for (const alternativeId of ownedAlternativeIds) {
                const alternative = alternativesById?.[alternativeId]
                const assignment = alternative?.['chartLegend']
                if (
                    typeof assignment !== 'object' ||
                    assignment === null ||
                    Array.isArray(assignment) ||
                    (assignment as Record<string, unknown>)['id'] !== op.legendId
                ) {
                    continue
                }
                const cleared: Record<string, unknown> = { ...alternative }
                delete cleared['chartLegend']
                alternativesById = { ...alternativesById, [alternativeId]: cleared as QnrAlternative }
                changed = true
            }

            return changed && alternativesById ? { ...withoutLegend, alternativesById } : withoutLegend
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
            const refusal = tabFieldPathRefusal(op.field)
            if (refusal !== undefined) throw new OperationConflictError(refusal)
            return { ...doc, tabsById: { ...doc.tabsById, [op.tabId]: writeField(tab, op.field, op.value) } }
        }

        case 'tab.move': {
            if (!doc.tabOrder?.includes(op.tabId)) {
                throw new OperationConflictError(`Unknown tab "${op.tabId}"`)
            }
            return { ...doc, tabOrder: moveInOrder(doc.tabOrder, op.tabId, op.toIndex) }
        }

        case 'tab.setLayout': {
            if (!doc.tabsById?.[op.tabId]) throw new OperationConflictError(`Unknown tab "${op.tabId}"`)
            if (!doc.questionsById?.[op.questionId]) {
                throw new OperationConflictError(`Unknown question "${op.questionId}"`)
            }

            const tab = doc.tabsById[op.tabId] ?? {}
            const layout = { ...((tab.layout ?? {}) as Record<string, unknown>) }
            const placements = { ...((layout['placementsByQuestionId'] ?? {}) as Record<string, LayoutPlacement>) }

            // One whole placement, written or removed as a unit — never a row without its cell.
            if (op.placement === null) delete placements[op.questionId]
            else placements[op.questionId] = op.placement

            if (Object.keys(placements).length === 0) delete layout['placementsByQuestionId']
            else layout['placementsByQuestionId'] = placements

            const nextTab = { ...tab }
            if (Object.keys(layout).length === 0) delete nextTab.layout
            else nextTab.layout = layout

            return { ...doc, tabsById: { ...doc.tabsById, [op.tabId]: nextTab } }
        }

        case 'tab.setQuestion': {
            const tab = doc.tabsById?.[op.tabId]
            if (!tab) throw new OperationConflictError(`Unknown tab "${op.tabId}"`)
            // Only inclusion needs a live question. Exclusion stays available with no question at all so
            // an imported document naming a question it never had can be repaired.
            if (op.include && !doc.questionsById?.[op.questionId]) {
                throw new OperationConflictError(`Unknown question "${op.questionId}"`)
            }

            let next: Record<string, unknown> = writeTabList(
                { ...tab },
                'questionIds',
                setListMember(tabListOf(tab, 'questionIds'), op.questionId, op.include, op.atIndex),
            )
            // Dropping membership drops what membership entitled the question to. A counted row or a
            // placement for a question the tab no longer shows is a reference to nothing, and it still
            // changes `document_hash`.
            if (!op.include) {
                next = writeTabList(
                    next,
                    'rowCountQuestionIds',
                    tabListOf(tab, 'rowCountQuestionIds').filter((id) => id !== op.questionId),
                )
                next = withoutTabPlacement(next, op.questionId)
            }

            return { ...doc, tabsById: { ...doc.tabsById, [op.tabId]: next as QnrTab } }
        }

        case 'tab.setRowCountQuestion': {
            const tab = doc.tabsById?.[op.tabId]
            if (!tab) throw new OperationConflictError(`Unknown tab "${op.tabId}"`)

            if (op.include) {
                const question = doc.questionsById?.[op.questionId]
                if (!question) throw new OperationConflictError(`Unknown question "${op.questionId}"`)
                // Only a grid has rows to count, and only a member of this tab contributes to its count.
                if (question.type !== 'QuestionGrid') {
                    throw new OperationConflictError(`Question "${op.questionId}" is not a question grid`)
                }
                if (!tabListOf(tab, 'questionIds').includes(op.questionId)) {
                    throw new OperationConflictError(
                        `Question "${op.questionId}" is not a member of tab "${op.tabId}"`,
                    )
                }
            }

            // Membership and layout are untouched: this operation owns exactly one list.
            const next = writeTabList(
                { ...tab },
                'rowCountQuestionIds',
                setListMember(tabListOf(tab, 'rowCountQuestionIds'), op.questionId, op.include, op.atIndex),
            )
            return { ...doc, tabsById: { ...doc.tabsById, [op.tabId]: next as QnrTab } }
        }

        case 'tab.delete': {
            if (!doc.tabsById?.[op.tabId]) {
                throw new OperationConflictError(`Unknown tab "${op.tabId}"`)
            }
            // A grid naming a deleted tab as its header would point at nothing; scrub before removing.
            const scrubbed = scrubHeaderTabRefs(doc, op.tabId)
            return patchDocument(scrubbed, {
                tabsById: scrubbed.tabsById && omitKey(scrubbed.tabsById, op.tabId),
                tabOrder: (scrubbed.tabOrder ?? []).filter((id) => id !== op.tabId),
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
            // The gate applies to KNOWN kinds only. An unknown-kind record keeps taking any field —
            // including the UI buffers legacy persisted — so a stored action replays byte-identically.
            if (isKnownActionKind(action.kind)) {
                const refusal =
                    knownActionFieldRefusal(action.kind, op.field) ?? knownActionValueRefusal(op.field, op.value)
                if (refusal !== undefined) throw new OperationConflictError(refusal)
            }
            return { ...doc, actionsById: { ...doc.actionsById, [op.actionId]: writeField(action, op.field, op.value) } }
        }

        case 'action.createTyped': {
            if (doc.actionsById?.[op.actionId]) {
                throw new OperationConflictError(`Action "${op.actionId}" already exists`)
            }
            // The op union now makes `{kind: 'topLevelAction', actionType}` unrepresentable, so this is
            // the replay/bypass boundary rather than the primary defence: an op read back from
            // `collab_ops` was never re-checked against the wire schema.
            const authoredActionType = (op as { actionType?: unknown }).actionType
            if (authoredActionType !== undefined && op.kind !== 'gridAction') {
                throw new OperationConflictError(`"actionType" belongs to a gridAction, not a ${op.kind}`)
            }
            if (authoredActionType !== undefined && !isActionType(authoredActionType)) {
                throw new OperationConflictError(`"${String(authoredActionType)}" is not a valid actionType`)
            }

            // Minimal form: kind plus only what was authored. No empty label, no empty collections.
            return {
                ...doc,
                actionsById: {
                    ...(doc.actionsById ?? {}),
                    [op.actionId]: {
                        kind: op.kind,
                        ...(op.label === undefined ? {} : { label: op.label }),
                        ...(op.actionType === undefined ? {} : { actionType: op.actionType }),
                    },
                },
            }
        }

        case 'action.setGridActionRef': {
            const action = requireKnownAction(doc, op.actionId, 'topLevelAction')
            const grid = doc.questionsById?.[op.gridQuestionId]
            if (!grid || grid.type !== 'QuestionGrid') {
                throw new OperationConflictError(`"${op.gridQuestionId}" is not a QuestionGrid`)
            }
            if (op.include) {
                // The referenced action must be a grid action THIS grid owns: a top-level button runs
                // one of that grid's actions, so a reference to an unowned one would compile to nothing.
                requireKnownAction(doc, op.gridActionId, 'gridAction')
                if (!presentationListOf(grid, 'actionIds').includes(op.gridActionId)) {
                    throw new OperationConflictError(
                        `Action "${op.gridActionId}" is not owned by grid "${op.gridQuestionId}"`,
                    )
                }
            }

            const byGrid = { ...((action['actionIdsByGridQuestionId'] ?? {}) as Record<string, string[]>) }
            const next = setListMember(byGrid[op.gridQuestionId] ?? [], op.gridActionId, op.include, op.atIndex)
            if (next.length === 0) delete byGrid[op.gridQuestionId]
            else byGrid[op.gridQuestionId] = next

            const nextAction = { ...action }
            if (Object.keys(byGrid).length === 0) delete nextAction['actionIdsByGridQuestionId']
            else nextAction['actionIdsByGridQuestionId'] = byGrid

            return { ...doc, actionsById: { ...doc.actionsById, [op.actionId]: nextAction } }
        }

        case 'action.setMetadata': {
            const action = requireKnownAction(doc, op.actionId, 'gridAction')

            if (op.metadata !== null) {
                // EXACTLY one owner, never "the first one found". An imported document can list one grid
                // action under two grids, and resolving the column vocabulary from `owners[0]` made the
                // same write accepted or refused purely by `questionsById` insertion order — two
                // documents with identical content and different key order disagreeing is precisely
                // what DOC-LAW-1 exists to prevent, so the ambiguity is reported instead of resolved.
                const owners = gridsOwningAction(doc, op.actionId)
                if (owners.length === 0) {
                    throw new OperationConflictError(
                        `Action "${op.actionId}" is owned by no grid, so its metadata has no column vocabulary`,
                    )
                }
                if (owners.length > 1) {
                    throw new OperationConflictError(
                        `Action "${op.actionId}" is owned by ${owners.length} grids (${[...owners].sort().join(', ')}); its metadata scope is ambiguous`,
                    )
                }

                // A metadata key is a COLUMN of the owning grid, not an arbitrary question: the action
                // copies or updates values within its own rows.
                const columnIds = doc.questionsById?.[owners[0] as string]?.grid?.columnIds ?? []
                if (!columnIds.includes(op.questionId)) {
                    throw new OperationConflictError(
                        `Question "${op.questionId}" is not a column of grid "${owners[0]}"`,
                    )
                }
            }
            // `metadata: null` needs no owner: removal is how a malformed or orphaned record gets
            // repaired, and requiring an owner would make exactly the documents that need fixing
            // unfixable.

            const byQuestion = { ...((action['metadataByQuestionId'] ?? {}) as Record<string, ActionMetadata>) }
            if (op.metadata === null) delete byQuestion[op.questionId]
            else byQuestion[op.questionId] = canonicalActionMetadata(op.metadata)

            const nextAction = { ...action }
            if (Object.keys(byQuestion).length === 0) delete nextAction['metadataByQuestionId']
            else nextAction['metadataByQuestionId'] = byQuestion

            return { ...doc, actionsById: { ...doc.actionsById, [op.actionId]: nextAction } }
        }

        case 'action.delete': {
            if (!doc.actionsById?.[op.actionId]) {
                throw new OperationConflictError(`Unknown action "${op.actionId}"`)
            }
            const scrubbed = scrubActionRefs(doc, op.actionId)
            return patchDocument(scrubbed, {
                actionsById: scrubbed.actionsById && omitKey(scrubbed.actionsById, op.actionId),
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
                    [op.bindingId]: writeBindingOptions(
                        { nodeId: op.nodeId, fieldId: op.fieldId, target: op.target },
                        op,
                    ),
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
            // The behaviours go through `writeBindingOptions` rather than the spread: a spread would
            // store `cardinality: '0..1'` verbatim (a key present with its own default — DOC-LAW-2) and
            // would write `null` for an unset, which the document may never carry.
            const {
                cardinality: _cardinality,
                onMissing: _onMissing,
                onMany: _onMany,
                ...structural
            } = op.patch

            return {
                ...doc,
                mappingBindingsById: {
                    ...doc.mappingBindingsById,
                    [op.bindingId]: writeBindingOptions({ ...binding, ...structural }, op.patch),
                },
            }
        }

        case 'mappingBinding.setLegacyOverride': {
            const binding = doc.mappingBindingsById?.[op.bindingId]
            if (!binding) {
                throw new OperationConflictError(`Unknown mapping binding "${op.bindingId}"`)
            }
            // Re-validated on replay, not only at the schema boundary: a log replays through here with
            // no validator in front of it, and a malformed value must not become canonical by replay.
            if (op.legacyOverride !== null && parseLegacyBindingOverride(op.legacyOverride).status !== 'known') {
                throw new OperationConflictError(
                    `Operation mappingBinding.setLegacyOverride carries a value that is not a canonical legacy override`,
                )
            }

            // Member-only: every other member is carried over untouched, so no node, field, target,
            // behaviour option or mapping `bindingOrder` can move when an exception is set or cleared.
            const next: Record<string, unknown> = { ...binding }
            if (op.legacyOverride === null) delete next['legacyOverride']
            else next['legacyOverride'] = op.legacyOverride

            return {
                ...doc,
                mappingBindingsById: { ...doc.mappingBindingsById, [op.bindingId]: next as MappingBinding },
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

        case 'mappingFilter.setTyped': {
            assertTypedFilterPayload(op)
            const node = doc.mappingNodesById?.[op.nodeId]
            if (!node) throw new OperationConflictError(`Unknown mapping node "${op.nodeId}"`)

            // REPLACED, not patched: switching `eq` -> `in` must not leave the old `value` beside the
            // new `values`, which a merge would. A filter carries its own operator's members and no
            // others, so one operator is always readable from the record alone.
            const filter: MappingFilter =
                op.operator === 'eq'
                    ? { fieldId: op.fieldId, operator: 'eq', value: op.value }
                    : op.operator === 'in'
                      ? { fieldId: op.fieldId, operator: 'in', values: [...op.values] }
                      : op.operator === 'isNull'
                        ? { fieldId: op.fieldId, operator: 'isNull', value: op.value }
                        : // `range` by elimination is safe ONLY because the validator above closed the
                          // operator set first; before it did, an unknown operator landed here.
                          {
                              fieldId: op.fieldId,
                              operator: 'range',
                              ...('from' in op && op.from !== undefined ? { from: op.from } : {}),
                              ...('to' in op && op.to !== undefined ? { to: op.to } : {}),
                          }

            const filterOrder = node.filterOrder ?? []
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
