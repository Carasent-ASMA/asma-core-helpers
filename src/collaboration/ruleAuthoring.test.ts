import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type } from 'arktype'
import { applyOperation, OperationConflictError } from './applyOperation.js'
import { canonicalJson, hashCanonical, reduceToMinimalForm } from './canonicalize.js'
import type { TemplateOp } from './operations.js'
import {
    qnrTemplateDocumentSchema, templateOpSchema, templateRuleAuthoringIsDefault,
    templateAuthoringIsDefault, templateDocumentIsDefault, templateDocumentIsDefaultV0281,
} from './schemas.js'
import { emptyTemplateDocument, type QnrTemplateDocument, type RuleSettingField } from './templateDocument.js'

const scaffold = (): QnrTemplateDocument => {
    const doc = [
        { type: 'question.create', questionId: 'target', questionType: 'TextShort' },
        { type: 'question.create', questionId: 'source', questionType: 'Dropdown' },
        { type: 'question.create', questionId: 'grid', questionType: 'QuestionGrid' },
        { type: 'gridColumn.create', questionId: 'grid', columnQuestionId: 'column', questionType: 'TextShort' },
        { type: 'alternative.create', questionId: 'source', alternativeId: 'a', label: 'A' },
        { type: 'alternative.create', questionId: 'column', alternativeId: 'other-a', label: 'Other' },
    ].reduce((doc, op) => applyOperation(doc, op as TemplateOp), emptyTemplateDocument('7684'))
    return {
        ...doc,
        highlightRulesById: {
            h: { condition: { sourceQuestionId: 'source', alternativeIds: ['a'] }, state: 2, highlight: true, showLink: true, importedText: 'preserved' },
            hc: { condition: { sourceQuestionId: 'source' }, state: 1 },
        },
        highlightRuleOrderByQuestionId: { target: ['h'], column: ['hc'] },
        narrativeRulesById: { n: { condition: { sourceQuestionId: 'source' } } },
        narrativeRuleOrderByQuestionId: { target: ['n'] },
        prefillRulesById: { p: { sourceQuestionId: 'source' } },
        prefillRuleOrderByQuestionId: { target: ['p'] },
    }
}

const settingsTypes = ['highlightRuleSettings.set', 'narrativeRuleSettings.set'] as const
const rootOf = (opType: typeof settingsTypes[number]) =>
    opType === 'highlightRuleSettings.set' ? 'highlightRuleSettingsByQuestionId' : 'narrativeRuleSettingsByQuestionId'
const apply = (doc: QnrTemplateDocument, ops: TemplateOp[]) => ops.reduce(applyOperation, doc)
const unsafe = (doc: QnrTemplateDocument, op: unknown) => applyOperation(doc, op as TemplateOp)
const refused = (doc: QnrTemplateDocument, op: unknown) => {
    const before = structuredClone(doc)
    assert.throws(() => unsafe(doc, op), OperationConflictError)
    assert.deepEqual(doc, before, 'rejection cannot mutate any input or partially apply an edit')
}

describe('7684-F02/F06 independent rule settings', () => {
    for (const opType of settingsTypes) {
        const root = rootOf(opType)
        for (const enabled of [false, true]) for (const requiredAll of [false, true]) {
            it(`${opType} stores the exact ${enabled}/${requiredAll} combination`, () => {
                const initial = scaffold()
                const result = apply(initial, [
                    { type: opType, questionId: 'target', field: 'enabled', value: enabled },
                    { type: opType, questionId: 'target', field: 'requiredAll', value: requiredAll },
                ])
                const expected = { ...(enabled ? { enabled: true } : {}), ...(requiredAll ? { requiredAll: true } : {}) }
                if (enabled || requiredAll) assert.deepEqual(result[root], { target: expected })
                else assert.equal(Object.hasOwn(result, root), false)
                assert.deepEqual(result.narrativeRulesById, initial.narrativeRulesById)
                assert.deepEqual(result.highlightRulesById, initial.highlightRulesById)
                assert.deepEqual(result.narrativeRuleOrderByQuestionId, initial.narrativeRuleOrderByQuestionId)
                assert.equal(result[rootOf(opType === settingsTypes[0] ? settingsTypes[1] : settingsTypes[0])], undefined)
            })
        }
        it(`${opType} clears only the selected field; concurrent edits commute`, () => {
            const base = apply(scaffold(), [
                { type: opType, questionId: 'target', field: 'enabled', value: true },
                { type: opType, questionId: 'target', field: 'requiredAll', value: true },
            ])
            const clearEnabled: TemplateOp = { type: opType, questionId: 'target', field: 'enabled', value: false }
            const clearAll: TemplateOp = { type: opType, questionId: 'target', field: 'requiredAll', value: false }
            assert.deepEqual(applyOperation(base, clearEnabled)[root], { target: { requiredAll: true } })
            assert.deepEqual(applyOperation(base, clearAll)[root], { target: { enabled: true } })
            assert.deepEqual(apply(base, [clearEnabled, clearAll]), apply(base, [clearAll, clearEnabled]))
            assert.deepEqual(apply(base, [clearEnabled, { ...clearEnabled, value: true }])[root], base[root])
        })
        for (const field of ['enabled', 'requiredAll'] as RuleSettingField[]) {
            it(`${opType} repeats ${field} idempotently in content`, () => {
                const op: TemplateOp = { type: opType, questionId: 'column', field, value: true }
                const once = applyOperation(scaffold(), op)
                assert.deepEqual(applyOperation(once, op), { ...once, revision: once.revision + 1 })
            })
        }
    }
    it('keeps narrative and highlight flags independent and settings after final rule deletion', () => {
        const doc = apply(scaffold(), [
            { type: 'narrativeRuleSettings.set', questionId: 'target', field: 'requiredAll', value: true },
            { type: 'highlightRuleSettings.set', questionId: 'target', field: 'enabled', value: true },
            { type: 'narrativeRule.delete', ruleId: 'n' },
            { type: 'highlightRule.delete', ruleId: 'h' },
        ])
        assert.deepEqual(doc.narrativeRuleSettingsByQuestionId, { target: { requiredAll: true } })
        assert.deepEqual(doc.highlightRuleSettingsByQuestionId, { target: { enabled: true } })
        assert.equal(doc.narrativeRulesById, undefined)
        assert.equal(doc.narrativeRuleOrderByQuestionId, undefined)
    })
})

describe('7684-F06 lossless highlight member edits', () => {
    it('edits condition then severity without erasing imported outputs or order', () => {
        const initial = scaffold()
        const condition = { sourceQuestionId: 'column', alternativeId: 'other-a', operator: 'Is' }
        const result = apply(initial, [
            { type: 'highlightRule.setField', ruleId: 'h', questionId: 'target', field: 'condition', value: condition },
            { type: 'highlightRule.setField', ruleId: 'h', questionId: 'target', field: 'state', value: 3 },
        ])
        assert.deepEqual(result.highlightRulesById?.h, { ...initial.highlightRulesById!.h, condition, state: 3 })
        assert.deepEqual(result.highlightRuleOrderByQuestionId, initial.highlightRuleOrderByQuestionId)
        assert.deepEqual(initial, scaffold(), 'the reducer must remain pure')
    })
    for (const field of ['state', 'highlight', 'showLink'] as const) {
        it(`clears only ${field}`, () => {
            const initial = scaffold()
            const result = unsafe(initial, { type: 'highlightRule.setField', questionId: 'target', ruleId: 'h', field, value: null })
            const expected = { ...initial.highlightRulesById!.h }
            delete expected[field]
            assert.deepEqual(result.highlightRulesById?.h, expected)
            assert.deepEqual(result.highlightRulesById?.hc, initial.highlightRulesById?.hc)
        })
    }
    it('preserves false and zero authored outputs and two-editor independent writes', () => {
        const base = scaffold()
        const severity: TemplateOp = { type: 'highlightRule.setField', questionId: 'target', ruleId: 'h', field: 'state', value: 0 }
        const link: TemplateOp = { type: 'highlightRule.setField', questionId: 'target', ruleId: 'h', field: 'showLink', value: false }
        const result = apply(base, [severity, link])
        assert.deepEqual(result, apply(base, [link, severity]))
        assert.equal(result.highlightRulesById!.h.state, 0)
        assert.equal(result.highlightRulesById!.h.showLink, false)
        assert.deepEqual(reduceToMinimalForm(result, { isDefault: templateRuleAuthoringIsDefault }), result)
        assert.deepEqual(result.prefillRulesById, base.prefillRulesById)
        assert.equal(result.visibilityRulesById, undefined, '7684-F08 prefill does not become visibility')
    })
})

describe('7684-F07 closed wire shapes and direct replay refusals', () => {
    for (const opType of settingsTypes) {
        for (const malformed of [
            { field: 'unknown', value: true }, { field: 'enabled', value: 'true' },
            { field: 'enabled', value: null }, { field: 'requiredAll', value: 1 },
            { field: 'enabled' }, { field: 'enabled', value: true, patch: {} },
        ]) it(`${opType} rejects ${JSON.stringify(malformed)} on wire and replay`, () => {
            const op = { type: opType, questionId: 'target', ...malformed }
            assert.ok(templateOpSchema(op) instanceof type.errors)
            refused(scaffold(), op)
        })
        it(`${opType} rejects a missing/deleted question after wire admission`, () => {
            const op = { type: opType, questionId: 'gone', field: 'enabled', value: true }
            assert.equal(templateOpSchema(op) instanceof type.errors, false)
            refused(scaffold(), op)
            const deleted = applyOperation(scaffold(), { type: 'question.delete', questionId: 'target' })
            refused(deleted, { ...op, questionId: 'target' })
            refused(scaffold(), { ...op, questionId: '__proto__' })
        })
    }
    for (const malformed of [
        { field: 'missing', value: true }, { field: 'state', value: true },
        { field: 'showLink', value: 'false' }, { field: 'highlight', value: 0 },
        { field: 'condition', value: null }, { field: 'condition', value: [] },
        { field: 'condition', value: { sourceQuestionId: 'source', alternativeIds: [1] } },
        { field: 'condition', value: { sourceQuestionId: 'source', operator: 1 } },
        { field: 'state', value: 3, patch: {} },
    ]) it(`highlight edit rejects ${JSON.stringify(malformed)} on wire and replay`, () => {
        const op = { type: 'highlightRule.setField', questionId: 'target', ruleId: 'h', ...malformed }
        assert.ok(templateOpSchema(op) instanceof type.errors)
        refused(scaffold(), op)
    })
    for (const value of [NaN, Infinity, -Infinity]) it(`direct replay refuses non-finite ${value}`, () => {
        refused(scaffold(), { type: 'highlightRule.setField', questionId: 'target', ruleId: 'h', field: 'state', value })
    })
    for (const patch of [
        { questionId: 'column' }, { questionId: 'gone' }, { ruleId: 'gone' },
        { field: 'condition', value: { sourceQuestionId: 'gone' } },
        { field: 'condition', value: { sourceQuestionId: 'source', alternativeId: 'other-a' } },
        { field: 'condition', value: { sourceQuestionId: 'source', alternativeIds: ['a', 'gone'] } },
    ]) it(`refuses invalid ownership/reference ${JSON.stringify(patch)}`, () => {
        refused(scaffold(), { type: 'highlightRule.setField', questionId: 'target', ruleId: 'h', field: 'showLink', value: false, ...patch })
    })
    it('refuses ambiguous ownership and deleted sources without partial writes', () => {
        const ambiguous = scaffold()
        ambiguous.highlightRuleOrderByQuestionId!.column.push('h')
        refused(ambiguous, { type: 'highlightRule.setField', questionId: 'target', ruleId: 'h', field: 'state', value: 3 })
        const deleted = applyOperation(scaffold(), { type: 'question.delete', questionId: 'source' })
        refused(deleted, { type: 'highlightRule.setField', questionId: 'target', ruleId: 'h', field: 'condition', value: { sourceQuestionId: 'source' } })
    })
})

describe('7684-F01/F05 ownership cleanup and canonical history', () => {
    for (const questionId of ['target', 'column', 'grid']) it(`question deletion cleans ${questionId}'s owned settings`, () => {
        const base = apply(scaffold(), ['target', 'column'].flatMap((questionId) => settingsTypes.map((type) =>
            ({ type, questionId, field: 'enabled', value: true } as TemplateOp))))
        const result = applyOperation(base, { type: 'question.delete', questionId })
        const deletedOwner = questionId === 'grid' ? 'column' : questionId
        for (const type of settingsTypes) {
            assert.equal(result[rootOf(type)]?.[deletedOwner], undefined)
            assert.deepEqual(result[rootOf(type)]?.[deletedOwner === 'target' ? 'column' : 'target'], { enabled: true })
        }
        assert.equal(result.highlightRuleOrderByQuestionId?.[deletedOwner], undefined)
    })
    it('prunes false flags and empty containers only under the new canonical predicate', () => {
        const raw = {
            ...scaffold(),
            narrativeRuleSettingsByQuestionId: { target: { enabled: false, requiredAll: true }, column: { enabled: false } },
            highlightRuleSettingsByQuestionId: { target: { enabled: true, requiredAll: false } },
        }
        const next = reduceToMinimalForm(raw, { isDefault: templateRuleAuthoringIsDefault })
        assert.deepEqual(next.narrativeRuleSettingsByQuestionId, { target: { requiredAll: true } })
        assert.deepEqual(next.highlightRuleSettingsByQuestionId, { target: { enabled: true } })
        assert.deepEqual(reduceToMinimalForm(next, { isDefault: templateRuleAuthoringIsDefault }), next)
        assert.equal(qnrTemplateDocumentSchema(next) instanceof type.errors, false)
        assert.deepEqual(reduceToMinimalForm(raw, { isDefault: templateAuthoringIsDefault }), raw)
        for (const predicate of [templateDocumentIsDefaultV0281, templateDocumentIsDefault, templateAuthoringIsDefault]) {
            assert.equal(predicate('narrativeRuleSettingsByQuestionId.target.enabled', false), false)
        }
        assert.equal(templateRuleAuthoringIsDefault('questionsById.target.enabled', false), false)
        assert.equal(templateRuleAuthoringIsDefault('highlightRulesById.h.highlight', false), false)
    })
    for (const settings of [{ enabled: false }, { requiredAll: 'true' }, { enabled: true, extra: true }, null]) {
        it(`narrative document settings reject ${JSON.stringify(settings)}`, () => {
            assert.ok(qnrTemplateDocumentSchema({ ...scaffold(), narrativeRuleSettingsByQuestionId: { target: settings } }) instanceof type.errors)
        })
    }
    it('replays the released replacing/moving setters unchanged', () => {
        const old = applyOperation(scaffold(), { type: 'highlightRule.set', ruleId: 'h', questionId: 'column', condition: { sourceQuestionId: 'historically-dangling' } })
        assert.deepEqual(old.highlightRulesById?.h, { condition: { sourceQuestionId: 'historically-dangling' } })
        assert.deepEqual(old.highlightRuleOrderByQuestionId, { column: ['hc', 'h'] })
        const narrative = applyOperation(scaffold(), { type: 'narrativeRule.set', ruleId: 'n', questionId: 'column', condition: { sourceQuestionId: 'historically-dangling' } })
        assert.deepEqual(narrative.narrativeRuleOrderByQuestionId, { column: ['n'] })
    })
    it('keeps historical hashes and new-write hashes distinct', async () => {
        const historical = { ...scaffold(), highlightRuleSettingsByQuestionId: { target: { enabled: true, requiredAll: false } } }
        const historicalHash = await hashCanonical(reduceToMinimalForm(historical, { isDefault: templateAuthoringIsDefault }))
        assert.equal(historicalHash, 'sha256:048fa69133403b437c749ba97e54ebb582defbe269e363a5f42921cfb3ed2e6c')
        const next = reduceToMinimalForm(historical, { isDefault: templateRuleAuthoringIsDefault })
        assert.notEqual(await hashCanonical(next), historicalHash)
        assert.equal(await hashCanonical(reduceToMinimalForm(historical, { isDefault: templateDocumentIsDefault })), historicalHash)
        assert.equal(canonicalJson(historical).includes('requiredAll":false'), true)
    })
})

/**
 * 7684-F02: shouldShow bypasses disabled rules; any([])=false, all([])=true.
 * Source: asma-app-qnreditor 1cf4a490bffec0db7ab9069729adb4104f0de8c3,
 * src/helpers/NarrativeValidator.ts shouldShow/computeLocalConditionals.
 * The match vectors include a missing source as false. No alternate runtime evaluator is exported.
 */
describe('7684-F02 legacy narrative truth fixtures and the unresolved presence boundary', () => {
    for (const enabled of [false, true]) for (const all of [false, true]) {
        for (const [matches, anyTruth, allTruth] of [
            [[], false, true], [[false], false, false], [[true], true, true], [[false, true], true, false],
        ] as const) it(`preserves enabled=${enabled} all=${all} matches=${JSON.stringify(matches)}`, () => {
            const doc = apply(scaffold(), [
                { type: 'narrativeRuleSettings.set', questionId: 'target', field: 'enabled', value: enabled },
                { type: 'narrativeRuleSettings.set', questionId: 'target', field: 'requiredAll', value: all },
            ])
            const settings = doc.narrativeRuleSettingsByQuestionId?.target
            const actual = !settings?.enabled || (settings.requiredAll ? matches.every(Boolean) : matches.some(Boolean))
            const legacyExpected = !enabled || (all ? allTruth : anyTruth)
            assert.equal(actual, legacyExpected)
        })
    }
    for (const enabled of [false, true]) for (const all of [false, true]) {
        for (const conditionalPresent of [false, true]) {
            it(`keeps ${conditionalPresent ? 'empty' : 'absent'} legacy conditional separate at ${enabled}/${all}`, () => {
                const doc = apply(scaffold(), [
                    { type: 'narrativeRuleSettings.set', questionId: 'target', field: 'enabled', value: enabled },
                    { type: 'narrativeRuleSettings.set', questionId: 'target', field: 'requiredAll', value: all },
                ])
                const settings = doc.narrativeRuleSettingsByQuestionId?.target
                const canonicalEmptyTruth = !settings?.enabled || !!settings.requiredAll
                // Pinned shouldShow: absent conditional bypasses computation; [] reaches any/all.
                const legacyTruth = !enabled || !conditionalPresent || all
                const unresolved = enabled && !all && !conditionalPresent
                if (unresolved) assert.notEqual(canonicalEmptyTruth, legacyTruth)
                else assert.equal(canonicalEmptyTruth, legacyTruth)
                const withEmptyOrder = { ...doc, narrativeRuleOrderByQuestionId: { target: [] } }
                const minimal = reduceToMinimalForm(withEmptyOrder)
                assert.equal(Object.hasOwn(minimal, 'narrativeRuleOrderByQuestionId'), false)
                assert.equal(Object.hasOwn(settings ?? {}, 'conditionalPresent'), false)
                // Approved interim: P1 refuses the unresolved family before writes. This release
                // adds no presence marker and cannot license coalescing those two truths at import.
            })
        }
    }
})
