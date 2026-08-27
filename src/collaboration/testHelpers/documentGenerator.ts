import type { TemplateOp } from '../operations.js'
import { makeExpressionTargetToken } from '../templateDocument.js'
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

// `Chart` and `ExpressionQuestion` are here so the AC-9 operations can reach a SUCCESS path: every one
// of them requires an owner of one of those exact types, so a run without them would only ever exercise
// refusals and a broken reducer would look fine.
const QUESTION_TYPES_FOR_PROP = ['TextShort', 'DateField', 'RadioButtons', 'CheckBoxes', 'LinearScale', 'QuestionGrid', 'Chart', 'ExpressionQuestion'] as const

const NEW_QUESTION_ID = (n: number): string => `q-${n}`
const NEW_ROW_ID = (n: number): string => `r-${n}`
const NEW_ALT_ID = (n: number): string => `a-${n}`
const NEW_TAB_ID = (n: number): string => `t-${n}`
const NEW_ACTION_ID = (n: number): string => `x-${n}`
const NEW_LEGEND_ID = (n: number): string => `lg-${n}`
const NEW_NODE_ID = (n: number): string => `n-${n}`
const NEW_BINDING_ID = (n: number): string => `b-${n}`
const NEW_FILTER_ID = (n: number): string => `f-${n}`
const NEW_VISIBILITY_RULE_ID = (n: number): string => `vr-${n}`
const NEW_COLUMN_ID = (n: number): string => `c-${n}`
const NEW_NARRATIVE_RULE_ID = (n: number): string => `nr-${n}`
const NEW_QNR_RULE_ID = (n: number): string => `qr-${n}`

type IdPools = {
    questions: string[]
    grids: string[]
    columns: string[]
    columnOwnerById: Record<string, string>
    gridRows: string[]
    alternatives: string[]
    /**
     * Which question each alternative hangs off.
     *
     * Needed because the Chart and Expression operations require an alternative owned by that exact
     * question: picking from the flat `alternatives` pool made every generated assignment a
     * wrong-owner refusal, so the reducer's success path was never reached at all.
     */
    alternativeOwnerById: Record<string, string>
    tabs: string[]
    actions: string[]
    nodes: string[]
    bindings: string[]
    filters: string[]
    charts: string[]
    /**
     * Charts whose `chart.type` is already `radar`.
     *
     * Tracked because the AC-9 Chart chain is five deep — create a Chart, set radar, create a legend,
     * create an alternative on that Chart, flag a target — and each step gates the next. Choosing
     * uniformly at each step made the whole chain vanishingly rare, so the reducer's success paths were
     * never reached and the property run proved nothing about them.
     */
    radarCharts: string[]
    expressionQuestions: string[]
    /** Chart legend ids, and the Chart each belongs to — an assignment must cite its owner's legend. */
    chartLegends: string[]
    chartLegendOwnerById: Record<string, string>
    /** Questions carrying `flags.is_expression`, i.e. the ones legal as a formula/assignment target. */
    expressionTargets: string[]
    visibilityRules: string[]
    highlightRules: string[]
    narrativeRules: string[]
    qnrRules: string[]
}

const emptyPools = (): IdPools => ({
    questions: [],
    grids: [],
    columns: [],
    columnOwnerById: {},
    gridRows: [],
    alternatives: [],
    alternativeOwnerById: {},
    tabs: [],
    actions: [],
    nodes: [],
    bindings: [],
    filters: [],
    charts: [],
    radarCharts: [],
    expressionQuestions: [],
    chartLegends: [],
    chartLegendOwnerById: {},
    expressionTargets: [],
    visibilityRules: [],
    highlightRules: [],
    narrativeRules: [],
    qnrRules: [],
})

/** Picks an id from a pool, or mints a new one when the pool is empty. */
const idOrNew = (random: () => number, pool: string[], mint: (n: number) => string): string =>
    pool.length > 0 && random() < 0.7 ? pick(random, pool) : mint(pool.length)

/** Picks from a pool when it has members, else the fallback — so a deleted id is a reducer conflict, not a crash. */
const pickOrFallback = (random: () => number, pool: string[], fallback: string): string =>
    pool.length === 0 ? fallback : pick(random, pool)

/** A schema-valid value for the given question field (op payloads are validated before the reducer). */
const fieldValue = (field: 'label' | 'required' | 'scale.from' | 'grid.singleRow', random: () => number) => {
    switch (field) {
        case 'label':
            return pick(random, ['Hei', 'Ha det', 'Tittel'])
        case 'required':
        case 'grid.singleRow':
            return pick(random, [true, false] as const)
        case 'scale.from':
            return 1
    }
}

const maybe = (random: () => number, probability: number): boolean => random() < probability

/** An alternative the given question actually owns, or a ghost id so the refusal path is reached. */
const ownedAlternative = (random: () => number, pools: IdPools, ownerId: string): string => {
    const owned = pools.alternatives.filter((id) => pools.alternativeOwnerById[id] === ownerId)
    return owned.length > 0 ? pick(random, owned) : 'a-ghost'
}

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
    if (maybe(random, 0.22)) return nextAddedContractOp(random, pools)
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
        const field = pick(random, ['label', 'required', 'scale.from', 'grid.singleRow'] as const)
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

/** Operations added by ASMA-7676, kept in a dedicated mix so every seeded run exercises them. */
const nextAddedContractOp = (random: () => number, pools: IdPools): TemplateOp => {
    const choice = Math.floor(random() * 25)
    const columnQuestionId = pickOrFallback(random, pools.columns, 'c-ghost')
    const ownerQuestionId = pools.columnOwnerById[columnQuestionId] ?? pickOrFallback(random, pools.grids, 'g-ghost')
    const questionId = idOrNew(random, pools.questions, NEW_QUESTION_ID)
    switch (choice) {
        case 0:
            return {
                type: 'gridColumn.create',
                questionId: pickOrFallback(random, pools.grids, 'g-ghost'),
                columnQuestionId: NEW_COLUMN_ID(pools.columns.length),
                questionType: pick(random, ['TextShort', 'DateField', 'RadioButtons'] as const),
                atIndex: Math.floor(random() * 4),
            }
        case 1:
            return {
                type: 'gridColumn.move',
                questionId: ownerQuestionId,
                columnQuestionId,
                toIndex: Math.floor(random() * 5),
            }
        case 2:
            return {
                type: 'gridColumn.setLayout',
                questionId: ownerQuestionId,
                columnQuestionId,
                placement: maybe(random, 0.25)
                    ? null
                    : { row: Math.floor(random() * 3), cell: Math.floor(random() * 4), keepCellSize: true },
            }
        case 3:
            return {
                type: 'narrativeRule.set',
                ruleId: NEW_NARRATIVE_RULE_ID(pools.narrativeRules.length),
                questionId,
                condition: { sourceQuestionId: pickOrFallback(random, pools.questions, 'q-ghost') },
            }
        case 4:
            return {
                type: 'narrativeRule.delete',
                ruleId: pickOrFallback(random, pools.narrativeRules, 'nr-ghost'),
            }
        case 5:
            return {
                type: 'qnrRule.set',
                ruleId: NEW_QNR_RULE_ID(pools.qnrRules.length),
                questionId,
                condition: { sourceQuestionId: pickOrFallback(random, pools.questions, 'q-ghost') },
                templateFamilyId: `family-${Math.floor(random() * 5)}`,
            }
        case 6:
            return { type: 'qnrRule.delete', ruleId: pickOrFallback(random, pools.qnrRules, 'qr-ghost') }
        case 7:
            return { type: 'question.move', questionId: columnQuestionId, toIndex: Math.floor(random() * 5) }
        // ── ASMA-7683 additive ops. Generated alongside the released vocabulary so the property run
        // exercises them against the same invariants (DOC-law, ownership, hash stability) rather than
        // only in their own hand-written cases.
        case 8:
            return {
                type: 'gridColumn.setFilter',
                questionId: ownerQuestionId,
                columnQuestionId,
                include: maybe(random, 0.7),
                ...(maybe(random, 0.5) ? { atIndex: Math.floor(random() * 3) } : {}),
            }
        case 9:
            return {
                type: 'gridColumn.setAction',
                questionId: pickOrFallback(random, pools.grids, 'g-ghost'),
                actionId: pickOrFallback(random, pools.actions, 'x-ghost'),
                include: maybe(random, 0.7),
                ...(maybe(random, 0.5) ? { atIndex: Math.floor(random() * 3) } : {}),
            }
        case 10:
            return {
                type: 'tab.setLayout',
                tabId: pickOrFallback(random, pools.tabs, 't-ghost'),
                questionId: pickOrFallback(random, pools.questions, 'q-ghost'),
                placement: maybe(random, 0.25)
                    ? null
                    : { row: Math.floor(random() * 3), cell: Math.floor(random() * 4) },
            }
        case 11:
            return {
                type: 'mappingFilter.setTyped',
                filterId: NEW_FILTER_ID(pools.filters.length),
                nodeId: pickOrFallback(random, pools.nodes, 'n-ghost'),
                fieldId: `fld-${Math.floor(random() * 4)}`,
                operator: 'eq',
                value: `v-${Math.floor(random() * 3)}`,
            }
        case 12:
            return {
                type: 'mappingFilter.setTyped',
                filterId: pickOrFallback(random, pools.filters, NEW_FILTER_ID(pools.filters.length)),
                nodeId: pickOrFallback(random, pools.nodes, 'n-ghost'),
                fieldId: `fld-${Math.floor(random() * 4)}`,
                operator: 'in',
                values: [`v-${Math.floor(random() * 3)}`, Math.floor(random() * 9)],
            }
        case 13:
            return {
                type: 'mappingFilter.setTyped',
                filterId: pickOrFallback(random, pools.filters, NEW_FILTER_ID(pools.filters.length)),
                nodeId: pickOrFallback(random, pools.nodes, 'n-ghost'),
                fieldId: `fld-${Math.floor(random() * 4)}`,
                operator: 'range',
                from: Math.floor(random() * 5),
                ...(maybe(random, 0.5) ? { to: 5 + Math.floor(random() * 5) } : {}),
            }
        case 14:
            return {
                type: 'action.createTyped',
                actionId: NEW_ACTION_ID(pools.actions.length),
                kind: maybe(random, 0.5) ? 'topLevelAction' : 'gridAction',
                ...(maybe(random, 0.6) ? { label: `Handling ${Math.floor(random() * 5)}` } : {}),
            }
        case 15:
            return {
                type: 'action.setMetadata',
                actionId: pickOrFallback(random, pools.actions, 'x-ghost'),
                questionId: columnQuestionId,
                metadata: maybe(random, 0.3) ? null : maybe(random, 0.5) ? { all: true } : { from: 'a', to: 'b' },
            }
        // ── ASMA-7683 combined post-v0.31 repair: tab membership, legacy override, AC-9. ──
        case 16:
            return {
                type: 'tab.setQuestion',
                tabId: pickOrFallback(random, pools.tabs, 't-ghost'),
                questionId: pickOrFallback(random, pools.questions, 'q-ghost'),
                include: maybe(random, 0.7),
                ...(maybe(random, 0.5) ? { atIndex: Math.floor(random() * 3) } : {}),
            }
        case 17:
            return {
                type: 'tab.setRowCountQuestion',
                tabId: pickOrFallback(random, pools.tabs, 't-ghost'),
                // Grids reach the success path; any question reaches the not-a-grid refusal.
                questionId: maybe(random, 0.6)
                    ? pickOrFallback(random, pools.grids, 'g-ghost')
                    : pickOrFallback(random, pools.questions, 'q-ghost'),
                include: maybe(random, 0.7),
                ...(maybe(random, 0.5) ? { atIndex: Math.floor(random() * 3) } : {}),
            }
        case 18:
            return {
                type: 'mappingBinding.setLegacyOverride',
                bindingId: pickOrFallback(random, pools.bindings, 'b-ghost'),
                legacyOverride: maybe(random, 0.3)
                    ? null
                    : maybe(random, 0.5)
                      ? { planId: `Actor.Felt${Math.floor(random() * 4)}` }
                      : { kind: 'connector', mappingRule: `rule-${Math.floor(random() * 3)}` },
            }
        // Enabling writes: the AC-9 operations require `chart.type: 'radar'` and
        // `flags.is_expression: true`, so a run that never sets them could only ever refuse.
        case 19: {
            // Advances the Chart chain by one step rather than re-rolling a step already taken. Each
            // step gates the next, so choosing uniformly among them left the far end (a legend that
            // exists long enough to be deleted) effectively unreachable in a seeded run.
            const pending = pools.charts.filter((id) => !pools.radarCharts.includes(id))
            if (pending.length > 0) {
                return {
                    type: 'question.updateField',
                    questionId: pick(random, pending),
                    // A `pie` occasionally, so the not-radar refusal is reached too.
                    field: 'chart.type',
                    value: maybe(random, 0.85) ? 'radar' : 'pie',
                }
            }
            return {
                type: 'chartLegend.create',
                questionId: pickOrFallback(random, pools.radarCharts, 'q-ghost'),
                legendId: NEW_LEGEND_ID(pools.chartLegends.length),
                label: `Legend ${pools.chartLegends.length}`,
                ...(maybe(random, 0.4) ? { atIndex: Math.floor(random() * 3) } : {}),
            }
        }
        case 20:
            return {
                type: 'question.updateField',
                questionId: pickOrFallback(random, pools.questions, 'q-ghost'),
                field: 'flags.is_expression',
                value: true,
            }
        case 21:
            return {
                type: 'chartLegend.create',
                // Radar charts reach the success path; a plain Chart reaches the not-radar refusal.
                questionId: maybe(random, 0.8)
                    ? pickOrFallback(random, pools.radarCharts, 'q-ghost')
                    : pickOrFallback(random, pools.charts, 'q-ghost'),
                legendId: NEW_LEGEND_ID(pools.chartLegends.length),
                label: `Legend ${pools.chartLegends.length}`,
                ...(maybe(random, 0.4) ? { atIndex: Math.floor(random() * 3) } : {}),
            }
        case 22: {
            const chartId = maybe(random, 0.85)
                ? pickOrFallback(random, pools.radarCharts, 'q-ghost')
                : pickOrFallback(random, pools.charts, 'q-ghost')
            // Scoped to this Chart's OWN legends. Picking from the global pool made almost every
            // generated delete a wrong-owner refusal, so the cascade was never exercised.
            const ownLegends = pools.chartLegends.filter((id) => pools.chartLegendOwnerById[id] === chartId)
            if (maybe(random, 0.3)) {
                return {
                    type: 'chartLegend.delete',
                    questionId: chartId,
                    legendId: ownLegends.length > 0 ? pick(random, ownLegends) : 'lg-ghost',
                }
            }
            // An assignment needs the Chart, an alternative that Chart owns, one of ITS legends, and a
            // flagged target. Anything less is a refusal, so all four are lined up here on purpose.
            return {
                type: 'alternative.setChartLegend',
                questionId: chartId,
                alternativeId: ownedAlternative(random, pools, chartId),
                chartLegend: maybe(random, 0.25)
                    ? null
                    : {
                          id: ownLegends.length > 0 ? pick(random, ownLegends) : 'lg-ghost',
                          questionIdMap: pickOrFallback(random, pools.expressionTargets, 'q-ghost'),
                      },
            }
        }
        case 23: {
            const targets = pools.expressionTargets.slice(0, 1 + Math.floor(random() * 2))
            const expressionQuestionId = pickOrFallback(random, pools.expressionQuestions, 'q-ghost')
            return {
                type: 'alternative.setExpressionFormula',
                questionId: expressionQuestionId,
                alternativeId: ownedAlternative(random, pools, expressionQuestionId),
                value: targets.map((id) => makeExpressionTargetToken(id)).join(' + ') || '0',
                expressionTargets: targets,
            }
        }
        // Alternatives on a Chart / ExpressionQuestion owner, which the general mix creates only by
        // accident — without them the two operations above can only ever refuse.
        case 24:
            return {
                type: 'alternative.create',
                questionId: maybe(random, 0.5)
                    ? pickOrFallback(random, pools.radarCharts, 'q-ghost')
                    : pickOrFallback(random, pools.expressionQuestions, 'q-ghost'),
                alternativeId: NEW_ALT_ID(pools.alternatives.length),
                label: 'Alt',
            }
        default:
            return {
                type: 'gridColumn.setLayout',
                questionId: ownerQuestionId,
                columnQuestionId,
                placement: null,
            }
    }
}

const updatePools = (op: TemplateOp, ok: boolean, pools: IdPools): void => {
    if (!ok) return
    switch (op.type) {
        case 'mappingFilter.setTyped':
            if (!pools.filters.includes(op.filterId)) pools.filters.push(op.filterId)
            return
        case 'action.createTyped':
            pools.actions.push(op.actionId)
            return
        case 'question.create':
            pools.questions.push(op.questionId)
            if (op.questionType === 'QuestionGrid') pools.grids.push(op.questionId)
            if (op.questionType === 'Chart') pools.charts.push(op.questionId)
            if (op.questionType === 'ExpressionQuestion') pools.expressionQuestions.push(op.questionId)
            break
        case 'question.delete':
            pools.questions = pools.questions.filter((id) => id !== op.questionId)
            pools.grids = pools.grids.filter((id) => id !== op.questionId)
            pools.columns = pools.columns.filter((id) => id !== op.questionId)
            pools.charts = pools.charts.filter((id) => id !== op.questionId)
            pools.radarCharts = pools.radarCharts.filter((id) => id !== op.questionId)
            pools.expressionQuestions = pools.expressionQuestions.filter((id) => id !== op.questionId)
            pools.expressionTargets = pools.expressionTargets.filter((id) => id !== op.questionId)
            // A deleted Chart takes its legends out of the pool with it, or a later assignment would
            // cite a legend whose owner no longer exists and could never reach a success path.
            pools.chartLegends = pools.chartLegends.filter((id) => pools.chartLegendOwnerById[id] !== op.questionId)
            for (const [legendId, owner] of Object.entries(pools.chartLegendOwnerById)) {
                if (owner === op.questionId) delete pools.chartLegendOwnerById[legendId]
            }
            delete pools.columnOwnerById[op.questionId]
            break
        case 'gridColumn.create':
            pools.questions.push(op.columnQuestionId)
            pools.columns.push(op.columnQuestionId)
            pools.columnOwnerById[op.columnQuestionId] = op.questionId
            break
        case 'gridRow.create':
            pools.gridRows.push(op.rowId)
            break
        case 'alternative.create':
            pools.alternatives.push(op.alternativeId)
            pools.alternativeOwnerById[op.alternativeId] = op.questionId
            break
        case 'alternative.delete':
            pools.alternatives = pools.alternatives.filter((id) => id !== op.alternativeId)
            delete pools.alternativeOwnerById[op.alternativeId]
            break
        case 'tab.create':
            pools.tabs.push(op.tabId)
            break
        case 'question.updateField':
            // Track the enabling writes, so a later target/legend choice can reach a success path.
            if (op.field === 'flags.is_expression' && op.value === true && !pools.expressionTargets.includes(op.questionId)) {
                pools.expressionTargets.push(op.questionId)
            }
            if (op.field === 'chart.type') {
                pools.radarCharts = pools.radarCharts.filter((id) => id !== op.questionId)
                if (op.value === 'radar') pools.radarCharts.push(op.questionId)
            }
            break
        case 'chartLegend.create':
            pools.chartLegends.push(op.legendId)
            pools.chartLegendOwnerById[op.legendId] = op.questionId
            break
        case 'chartLegend.delete':
            pools.chartLegends = pools.chartLegends.filter((id) => id !== op.legendId)
            delete pools.chartLegendOwnerById[op.legendId]
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
            if (!pools.visibilityRules.includes(op.ruleId)) pools.visibilityRules.push(op.ruleId)
            break
        case 'narrativeRule.set':
            if (!pools.narrativeRules.includes(op.ruleId)) pools.narrativeRules.push(op.ruleId)
            break
        case 'narrativeRule.delete':
            pools.narrativeRules = pools.narrativeRules.filter((id) => id !== op.ruleId)
            break
        case 'qnrRule.set':
            if (!pools.qnrRules.includes(op.ruleId)) pools.qnrRules.push(op.ruleId)
            break
        case 'qnrRule.delete':
            pools.qnrRules = pools.qnrRules.filter((id) => id !== op.ruleId)
            break
        case 'mappingBinding.create':
            pools.bindings.push(op.bindingId)
            break
        default:
            break
    }
}
