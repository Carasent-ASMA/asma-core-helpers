import type { TemplateOp } from '../operations.js'
import { mulberry32, pick } from './seededRandom.js'

/**
 * A seeded generator of authoring op sequences for the property tests.
 *
 * The generator keeps its own pools of "known" ids so most generated ops target things that
 * exist (the reducer still throws on the genuinely conflicting ones — that is fine and is
 * part of what the tests exercise). It is pure in the seed: the same seed yields the same
 * sequence, which is what the determinism tests rely on.
 *
 * The op mix is intentionally broad and mildly unrealistic (renames without a preceding
 * create, moves to random indices, rules set on any question) — the point is coverage of
 * the reducer's conflict paths, not a faithful editing session.
 */

export const DOCUMENT_ID = 'tpl-prop'

const QUESTION_TYPES_FOR_PROP = ['TextShort', 'DateField', 'RadioButtons', 'CheckBoxes', 'LinearScale', 'QuestionGrid'] as const

const NEW_QUESTION_ID = (n: number): string => `q-${n}`
const NEW_ROW_ID = (n: number): string => `r-${n}`
const NEW_ALT_ID = (n: number): string => `a-${n}`
const NEW_TAB_ID = (n: number): string => `t-${n}`
const NEW_ACTION_ID = (n: number): string => `x-${n}`
const NEW_NODE_ID = (n: number): string => `n-${n}`
const NEW_BINDING_ID = (n: number): string => `b-${n}`
const NEW_FILTER_ID = (n: number): string => `f-${n}`
const NEW_VISIBILITY_RULE_ID = (n: number): string => `vr-${n}`

type IdPools = {
    questions: string[]
    grids: string[]
    gridRows: string[]
    alternatives: string[]
    tabs: string[]
    actions: string[]
    nodes: string[]
    bindings: string[]
    filters: string[]
    visibilityRules: string[]
    highlightRules: string[]
}

const emptyPools = (): IdPools => ({
    questions: [],
    grids: [],
    gridRows: [],
    alternatives: [],
    tabs: [],
    actions: [],
    nodes: [],
    bindings: [],
    filters: [],
    visibilityRules: [],
    highlightRules: [],
})

/** Picks an id from a pool, or mints a new one when the pool is empty. */
const idOrNew = (random: () => number, pool: string[], mint: (n: number) => string): string =>
    pool.length > 0 && random() < 0.7 ? pick(random, pool) : mint(pool.length)

/** Picks from a pool when it has members, else the fallback — so a deleted id is a reducer conflict, not a crash. */
const pickOrFallback = (random: () => number, pool: string[], fallback: string): string =>
    pool.length === 0 ? fallback : pick(random, pool)

/** A schema-valid value for the given question field (op payloads are validated before the reducer). */
const fieldValue = (field: 'label' | 'required' | 'scale.from' | 'grid.singleRow' | 'grid.columnIds', random: () => number) => {
    switch (field) {
        case 'label':
            return pick(random, ['Hei', 'Ha det', 'Tittel'])
        case 'required':
        case 'grid.singleRow':
            return pick(random, [true, false] as const)
        case 'scale.from':
            return 1
        case 'grid.columnIds':
            return pick(random, [['c-0'], ['c-1', 'c-2'], []] as Array<string[]>)
    }
}

const maybe = (random: () => number, probability: number): boolean => random() < probability

export type GeneratedSequence = {
    ops: TemplateOp[]
    /** Whether each op was applied (false = the reducer rejected it — expected conflicts). */
    outcomes: boolean[]
    pools: IdPools
}

/**
 * Generates `count` ops. `applyOnce` is the reducer's `applyOperation` guarded to return
 * `null` on OperationConflictError, so the generator can feed back which ids now exist.
 */
export const generateOpSequence = (
    seed: number,
    count: number,
    applyOnce: (op: TemplateOp) => boolean,
): GeneratedSequence => {
    const random = mulberry32(seed)
    const pools = emptyPools()
    const ops: TemplateOp[] = []
    const outcomes: boolean[] = []

    for (let step = 0; step < count; step++) {
        const op = nextOp(random, pools)
        const ok = applyOnce(op)
        ops.push(op)
        outcomes.push(ok)
        updatePools(op, ok, pools)
    }

    return { ops, outcomes, pools }
}

const nextOp = (random: () => number, pools: IdPools): TemplateOp => {
    const roll = random()

    if (roll < 0.1) {
        return { type: 'template.updateMeta', patch: maybe(random, 0.5) ? { title: 'T' } : { title: null } }
    }
    if (roll < 0.2) {
        const id = pools.questions.length === 0 ? NEW_QUESTION_ID(0) : maybe(random, 0.6) ? pick(random, pools.questions) : NEW_QUESTION_ID(pools.questions.length)
        return { type: 'question.create', questionId: id, questionType: pick(random, QUESTION_TYPES_FOR_PROP) }
    }
    if (roll < 0.3) {
        const questionId = idOrNew(random, pools.questions, NEW_QUESTION_ID)
        const field = pick(random, ['label', 'required', 'scale.from', 'grid.singleRow', 'grid.columnIds'] as const)
        // The op schema validates op payloads before the reducer runs, so generated ops must
        // be schema-valid: each field gets a value of the field's own type.
        const value = fieldValue(field, random)
        return { type: 'question.updateField', questionId, field, value }
    }
    if (roll < 0.34) {
        const questionId = idOrNew(random, pools.questions, NEW_QUESTION_ID)
        return { type: 'question.move', questionId, toIndex: Math.floor(random() * 10) }
    }
    if (roll < 0.4) {
        return { type: 'question.delete', questionId: idOrNew(random, pools.questions, NEW_QUESTION_ID) }
    }
    if (roll < 0.46) {
        const questionId = idOrNew(random, pools.questions, NEW_QUESTION_ID)
        return { type: 'gridRow.create', questionId, rowId: NEW_ROW_ID(pools.gridRows.length) }
    }
    if (roll < 0.5) {
        const questionId = idOrNew(random, pools.questions, NEW_QUESTION_ID)
        const rowId = pools.gridRows.length === 0 ? NEW_ROW_ID(0) : pick(random, pools.gridRows)
        return { type: 'gridRow.move', questionId, rowId, afterRowId: maybe(random, 0.8) ? (pools.gridRows.length === 0 ? null : pick(random, pools.gridRows)) : null }
    }
    if (roll < 0.53) {
        const questionId = idOrNew(random, pools.questions, NEW_QUESTION_ID)
        return { type: 'gridRow.delete', questionId, rowId: pickOrFallback(random, pools.gridRows, 'r-ghost') }
    }
    if (roll < 0.58) {
        const questionId = idOrNew(random, pools.questions, NEW_QUESTION_ID)
        return { type: 'alternative.create', questionId, alternativeId: NEW_ALT_ID(pools.alternatives.length), label: 'Alt' }
    }
    if (roll < 0.64) {
        const questionId = idOrNew(random, pools.questions, NEW_QUESTION_ID)
        return { type: 'alternative.updateField', questionId, alternativeId: pickOrFallback(random, pools.alternatives, 'a-ghost'), field: 'label', value: pick(random, ['Ja', 'Nei', null] as const) }
    }
    if (roll < 0.68) {
        const questionId = idOrNew(random, pools.questions, NEW_QUESTION_ID)
        return { type: 'alternative.move', questionId, alternativeId: pickOrFallback(random, pools.alternatives, 'a-ghost'), toIndex: Math.floor(random() * 6) }
    }
    if (roll < 0.72) {
        const questionId = idOrNew(random, pools.questions, NEW_QUESTION_ID)
        return { type: 'alternative.delete', questionId, alternativeId: pickOrFallback(random, pools.alternatives, 'a-ghost') }
    }
    if (roll < 0.76) {
        return { type: 'tab.create', tabId: NEW_TAB_ID(pools.tabs.length), label: 'Tab' }
    }
    if (roll < 0.8) {
        return { type: 'tab.move', tabId: pickOrFallback(random, pools.tabs, 't-ghost'), toIndex: Math.floor(random() * 5) }
    }
    if (roll < 0.84) {
        return { type: 'action.create', actionId: NEW_ACTION_ID(pools.actions.length), kind: 'submit' }
    }
    if (roll < 0.86) {
        return { type: 'dataMapping.create', mappingId: `m-${Math.floor(random() * 4)}`, sourceId: 'adopus-legacy', rootNodeId: idOrNew(random, pools.nodes, NEW_NODE_ID) }
    }
    if (roll < 0.9) {
        return { type: 'mappingNode.create', nodeId: NEW_NODE_ID(pools.nodes.length), entityId: 'Actor', parentNodeId: pools.nodes.length > 0 && maybe(random, 0.5) ? pick(random, pools.nodes) : undefined }
    }
    if (roll < 0.94) {
        const nodeId = idOrNew(random, pools.nodes, NEW_NODE_ID)
        return { type: 'mappingFilter.set', filterId: NEW_FILTER_ID(pools.filters.length), nodeId, fieldId: 'Status', operator: 'eq', value: 'Active' }
    }
    if (roll < 0.97) {
        const questionId = idOrNew(random, pools.questions, NEW_QUESTION_ID)
        return { type: 'visibilityRule.set', ruleId: NEW_VISIBILITY_RULE_ID(pools.visibilityRules.length), questionId, condition: { sourceQuestionId: pickOrFallback(random, pools.questions, 'q-ghost') } }
    }
    return {
        type: 'mappingBinding.create',
        bindingId: NEW_BINDING_ID(pools.bindings.length),
        nodeId: idOrNew(random, pools.nodes, NEW_NODE_ID),
        fieldId: 'Navn',
        target: { kind: 'question', questionId: idOrNew(random, pools.questions, NEW_QUESTION_ID) },
    }
}

const updatePools = (op: TemplateOp, ok: boolean, pools: IdPools): void => {
    if (!ok) return
    switch (op.type) {
        case 'question.create':
            pools.questions.push(op.questionId)
            break
        case 'question.delete':
            pools.questions = pools.questions.filter((id) => id !== op.questionId)
            break
        case 'gridRow.create':
            pools.gridRows.push(op.rowId)
            break
        case 'alternative.create':
            pools.alternatives.push(op.alternativeId)
            break
        case 'tab.create':
            pools.tabs.push(op.tabId)
            break
        case 'action.create':
            pools.actions.push(op.actionId)
            break
        case 'dataMapping.create':
            break // mapping ids are a closed small space by design
        case 'mappingNode.create':
            pools.nodes.push(op.nodeId)
            break
        case 'mappingFilter.set':
            pools.filters.push(op.filterId)
            break
        case 'visibilityRule.set':
            pools.visibilityRules.push(op.ruleId)
            break
        case 'mappingBinding.create':
            pools.bindings.push(op.bindingId)
            break
        default:
            break
    }
}
